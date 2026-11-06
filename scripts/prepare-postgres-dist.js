const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const crypto = require('node:crypto')
const zlib = require('node:zlib')
const { execFileSync } = require('node:child_process')
const { Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')

// Verified 2026-11-03 against EDB's HTTPS checksum (not a locally bootstrapped hash).
// https://www.postgresql.org/download/windows/ links to the EDB binary distribution.
// PostgreSQL 17 is supported through 2029-11-08: https://www.postgresql.org/support/versioning/
const DISTRIBUTION = Object.freeze({
  version: '17.11',
  revision: '5',
  platform: 'windows-x64',
  archive: 'postgresql-17.11-5-windows-x64-binaries.zip',
  url: 'https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64-binaries.zip',
  sha256: '80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f',
  checksumSource: 'https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64-binaries.zip.sha256',
  source: 'https://www.enterprisedb.com/download-postgresql-binaries',
})
const REQUIRED_TOOLS = Object.freeze(['postgres.exe', 'pg_ctl.exe', 'initdb.exe', 'psql.exe', 'pg_isready.exe'])
const REQUIRED_CRT_DLLS = Object.freeze(['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll'])
const LICENSES = Object.freeze(['server_license.txt', 'commandlinetools_3rd_party_licenses.txt'])
const MAX_ARCHIVE = 512 * 1024 * 1024
const MAX_FILE = 256 * 1024 * 1024
const MAX_EXPANDED = 2 * 1024 * 1024 * 1024
const DOWNLOAD_TIMEOUT = 120000
const MAX_REDIRECTS = 3

function approvedUrl(value) {
  const url = new URL(value)
  // No implicit CDN/proxy trust, credentials, non-TLS hops or alternate ports.
  if (url.protocol !== 'https:' || url.hostname !== 'get.enterprisedb.com' ||
      url.port || url.username || url.password || url.hash) {
    throw new Error(`Unapproved PostgreSQL download URL: ${url.href}`)
  }
  return url
}

async function downloadArchive(destination) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT)
  let output
  try {
    let url = approvedUrl(DISTRIBUTION.url)
    for (let redirects = 0; ; redirects++) {
      const response = await new Promise((resolve, reject) => {
        const request = https.get(url, { signal: controller.signal, minVersion: 'TLSv1.2' }, resolve)
        request.on('error', reject)
      })
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.destroy()
        if (redirects >= MAX_REDIRECTS || !response.headers.location) {
          throw new Error('PostgreSQL download redirect limit/missing Location')
        }
        url = approvedUrl(new URL(response.headers.location, url).href)
        continue
      }
      if (response.statusCode !== 200 || Number(response.headers['content-length']) > MAX_ARCHIVE) {
        response.destroy()
        throw new Error(`PostgreSQL download rejected (HTTP ${response.statusCode}, size limit ${MAX_ARCHIVE})`)
      }
      let received = 0
      const bounded = new Transform({
        transform(chunk, encoding, callback) {
          received += chunk.length
          callback(received > MAX_ARCHIVE ? new Error('PostgreSQL archive exceeds size limit') : null, chunk)
        },
      })
      output = fs.createWriteStream(destination, { flags: 'wx' })
      await pipeline(response, bounded, output, { signal: controller.signal })
      break
    }
  } finally {
    clearTimeout(timer)
    // The caller owns the unique temporary directory and removes failed downloads.
    if (output && !output.closed) output.destroy()
  }
}

function regularFile(file) {
  const stat = fs.lstatSync(file)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) {
    throw new Error(`Expected nonempty regular file (no symlinks): ${file}`)
  }
  return stat
}

function retryWindowsIO(operation, attempts = 8, delay = 250) {
  for (let attempt = 1; ; attempt++) {
    try {
      return operation()
    } catch (error) {
      if (attempt >= attempts || !['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) {
        throw error
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay * attempt)
    }
  }
}

function verifyArchive(file) {
  const stat = regularFile(file)
  if (stat.size > MAX_ARCHIVE) throw new Error('PostgreSQL archive exceeds size limit')
  const bytes = fs.readFileSync(file)
  const digest = crypto.createHash('sha256').update(bytes).digest('hex')
  if (digest !== DISTRIBUTION.sha256) {
    throw new Error(`PostgreSQL SHA-256 mismatch: expected ${DISTRIBUTION.sha256}, got ${digest}. ` +
      'The archive/cache must be replaced with the pinned official EDB ZIP; no checksum override is supported.')
  }
  return bytes
}

function safeArchivePath(name) {
  // Check Windows semantics even when preparing on a non-Windows build host:
  // ADS, device names, UNC, drive-relative paths and case aliases are unsafe.
  const directory = name.endsWith('/')
  const parts = (directory ? name.slice(0, -1) : name).split('/')
  if (!name || name.includes('\\') || parts.some(part => !part || part === '.' || part === '..' ||
      /[<>:"|?*\x00-\x1f\x7f]/.test(part) || /[. ]$/.test(part) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error(`Unsafe ZIP path: ${JSON.stringify(name)}`)
  }
  if (parts[0] !== 'pgsql') throw new Error(`Unexpected ZIP root: ${name}`)
  return { parts, directory }
}

// Small dependency-free ZIP reader for this pinned ZIP32 archive. Reject ZIP64,
// encryption and special files rather than delegating unsafe extraction to a shell.
function readZip(bytes) {
  if (bytes.length < 22 || bytes.length > MAX_ARCHIVE) throw new Error('Invalid ZIP size')
  let end = bytes.length - 22
  const minimum = Math.max(0, end - 65535)
  while (end >= minimum && !(bytes.readUInt32LE(end) === 0x06054b50 &&
    end + 22 + bytes.readUInt16LE(end + 20) === bytes.length)) end--
  if (end < minimum) throw new Error('Missing ZIP end record')
  const count = bytes.readUInt16LE(end + 10)
  const size = bytes.readUInt32LE(end + 12)
  const offset = bytes.readUInt32LE(end + 16)
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) ||
      count !== bytes.readUInt16LE(end + 8) || count === 0xffff ||
      offset === 0xffffffff || size === 0xffffffff || offset + size !== end) {
    throw new Error('Unsupported ZIP64/multipart/invalid central directory')
  }
  const entries = []
  const names = new Map()
  let cursor = offset
  let expanded = 0
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP entry')
    const flags = bytes.readUInt16LE(cursor + 8)
    const method = bytes.readUInt16LE(cursor + 10)
    const compressed = bytes.readUInt32LE(cursor + 20)
    const length = bytes.readUInt32LE(cursor + 24)
    const nameLength = bytes.readUInt16LE(cursor + 28)
    const extraLength = bytes.readUInt16LE(cursor + 30)
    const commentLength = bytes.readUInt16LE(cursor + 32)
    const attributes = bytes.readUInt32LE(cursor + 38)
    const local = bytes.readUInt32LE(cursor + 42)
    const next = cursor + 46 + nameLength + extraLength + commentLength
    if (next > end) throw new Error('Truncated ZIP entry')
    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength)
    const name = rawName.toString('utf8')
    if (!Buffer.from(name, 'utf8').equals(rawName)) throw new Error('Invalid UTF-8 ZIP filename')
    const { directory } = safeArchivePath(name)
    const kind = (attributes >>> 16) & 0xf000
    if ((kind && kind !== (directory ? 0x4000 : 0x8000)) || (attributes & 0x400)) {
      throw new Error(`ZIP symlink/reparse/special file rejected: ${name}`)
    }
    const key = name.replace(/\/$/, '').toLowerCase()
    if (names.has(key)) throw new Error(`Duplicate ZIP path: ${name}`)
    names.set(key, directory)
    expanded += length
    if ((flags & ~0x080e) || (flags & 1) || ![0, 8].includes(method) ||
        compressed === 0xffffffff || length > MAX_FILE || expanded > MAX_EXPANDED ||
        bytes.readUInt16LE(cursor + 34) || local + 30 > offset ||
        bytes.readUInt32LE(local) !== 0x04034b50) throw new Error(`Unsupported/oversized ZIP entry: ${name}`)
    const localNameLength = bytes.readUInt16LE(local + 26)
    const start = local + 30 + localNameLength + bytes.readUInt16LE(local + 28)
    if (start + compressed > offset || bytes.readUInt16LE(local + 6) !== flags ||
        bytes.readUInt16LE(local + 8) !== method ||
        !bytes.subarray(local + 30, local + 30 + localNameLength).equals(rawName)) {
      throw new Error(`ZIP local/central header mismatch: ${name}`)
    }
    entries.push({ name, directory, method, length, start, compressed })
    cursor = next
  }
  if (cursor !== end) throw new Error('Invalid ZIP directory length')
  for (const key of names.keys()) {
    const parts = key.split('/')
    while (parts.pop() && parts.length) {
      if (names.get(parts.join('/')) === false) throw new Error(`ZIP file/directory collision: ${key}`)
    }
  }
  return entries
}

function outputPath(entry) {
  const parts = entry.name.replace(/\/$/, '').split('/').slice(1)
  if (parts.length === 1 && LICENSES.includes(parts[0])) return `licenses/${parts[0]}`
  if (!['bin', 'lib', 'share'].includes(parts[0])) return null
  if (parts.some(part => /^(?:data|pg_wal|pg_tblspc|\.git|\.env(?:\..*)?|pgpass(?:\.conf)?|postmaster\.(?:pid|opts))$/i.test(part)) ||
      /\.(?:key|pfx|p12)$/i.test(parts.at(-1))) {
    throw new Error(`Data/secrets are not allowed in PostgreSQL resources: ${entry.name}`)
  }
  return parts.join('/')
}

function requireLayout(directory) {
  for (const tool of REQUIRED_TOOLS) regularFile(path.join(directory, 'bin', tool))
  for (const license of LICENSES) regularFile(path.join(directory, 'licenses', license))
  for (const folder of ['lib', 'share']) {
    if (!fs.lstatSync(path.join(directory, folder)).isDirectory()) throw new Error(`Missing ${folder} directory`)
  }
  for (const file of ['share/postgres.bki', 'share/postgresql.conf.sample', 'lib/plpgsql.dll', 'bin/libpq.dll']) {
    regularFile(path.join(directory, file))
  }
}

function findVisualCppRuntime() {
  const roots = []
  for (const value of [process.env.VCToolsRedistDir, process.env.VSINSTALLDIR]) {
    if (value) roots.push(path.resolve(value))
  }
  const installer = path.join(
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    'Microsoft Visual Studio', 'Installer', 'vswhere.exe',
  )
  if (fs.existsSync(installer)) {
    try {
      const installation = execFileSync(installer, [
        '-latest', '-products', '*', '-property', 'installationPath',
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      if (installation) roots.push(path.join(installation, 'VC', 'Redist', 'MSVC'))
    } catch {
      // Other known Visual Studio roots are still checked below.
    }
  }

  const families = ['Microsoft.VC143.CRT', 'Microsoft.VC142.CRT', 'Microsoft.VC141.CRT']
  const candidates = []
  for (const root of roots) {
    candidates.push(root)
    for (const family of families) candidates.push(path.join(root, 'x64', family))
    const parent = path.dirname(root)
    const redist = path.basename(root).toLowerCase() === 'msvc'
      ? root
      : path.basename(parent).toLowerCase() === 'msvc'
        ? parent
        : path.join(root, 'VC', 'Redist', 'MSVC')
    if (!fs.existsSync(redist)) continue
    for (const version of fs.readdirSync(redist, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))) {
      for (const family of families) candidates.push(path.join(redist, version, 'x64', family))
    }
  }

  for (const candidate of candidates) {
    if (REQUIRED_CRT_DLLS.every(name => {
      try {
        regularFile(path.join(candidate, name))
        return true
      } catch {
        return false
      }
    })) return candidate
  }
  throw new Error(
    'No se encontró el runtime x64 de Visual C++ (vcruntime140.dll, vcruntime140_1.dll, msvcp140.dll). ' +
    'Instala Visual Studio Build Tools con los archivos de redistribución C++ x64 y vuelve a generar el instalador.',
  )
}

function copyVisualCppRuntime(directory, source = findVisualCppRuntime()) {
  const bin = path.join(directory, 'bin')
  for (const name of REQUIRED_CRT_DLLS) {
    const file = path.join(source, name)
    regularFile(file)
    fs.copyFileSync(file, path.join(bin, name), fs.constants.COPYFILE_EXCL)
  }
}

// Internal packing primitive for synthetic tests. Production always verifies the
// whole archive with verifyArchive BEFORE parsing or writing any extracted bytes.
function stageArchive(bytes, staging) {
  rejectSymlinkAncestors(staging)
  if (!fs.lstatSync(staging).isDirectory() || fs.readdirSync(staging).length) {
    throw new Error('PostgreSQL staging must be an empty directory')
  }
  const entries = readZip(bytes)
  const selected = entries.map(entry => ({ ...entry, target: outputPath(entry) })).filter(entry => entry.target)
  for (const entry of selected) {
    const target = path.join(staging, ...entry.target.split('/'))
    if (entry.directory) {
      fs.mkdirSync(target, { recursive: true })
      continue
    }
    const compressed = bytes.subarray(entry.start, entry.start + entry.compressed)
    const content = entry.method === 8
      ? zlib.inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.length) })
      : compressed
    if (content.length !== entry.length) throw new Error(`ZIP expanded size mismatch: ${entry.name}`)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content, { flag: 'wx' })
  }
  requireLayout(staging)
  fs.writeFileSync(path.join(staging, 'distribution.json'), JSON.stringify({
    ...DISTRIBUTION,
    requiredTools: REQUIRED_TOOLS,
    prerequisites: {
      windows: 'Windows x64 with Universal CRT (Windows 10/Server 2016 or newer)',
      visualCpp: 'Microsoft Visual C++ 2015-2022 compatible x64 runtime; app-local DLLs are bundled beside PostgreSQL executables.',
      visualCppDlls: REQUIRED_CRT_DLLS,
      visualCppLicense: 'Redistributable files from Visual Studio Build Tools; distributor must comply with the Microsoft license terms.',
      universalCrt: 'api-ms-win-crt-* imports require the Windows Universal CRT',
      documentation: 'https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files',
      installation: 'The app-local CRT is loaded only by the bundled PostgreSQL binaries; no system PostgreSQL service or machine-wide runtime installation is performed.',
    },
    licensing: {
      notices: LICENSES.map(file => `licenses/${file}`),
      review: 'Preserve all notices. Third-party libraries include LGPL components: corresponding-source/relinking obligations require distributor review before shipping. Copying notices alone is not a source offer.',
      postgresLicense: 'https://www.postgresql.org/about/licence/',
    },
  }, null, 2) + '\n', { flag: 'wx' })
}

function rejectSymlinkAncestors(target) {
  for (let current = path.resolve(target); ; current = path.dirname(current)) {
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Symlink/junction path rejected: ${current}`)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    if (path.dirname(current) === current) break
  }
}

async function preparePostgres(root, { archive } = {}) {
  const tauri = path.join(root, 'src-tauri')
  // Keep the build source separate from legacy/runtime folders that may be in use.
  const destination = path.join(tauri, 'postgres-bundle')
  rejectSymlinkAncestors(destination)
  if (!fs.statSync(tauri).isDirectory()) throw new Error(`Missing Tauri directory: ${tauri}`)
  let bytes
  if (archive) {
    // Offline input is still subject to the exact same pinned hash; never fetched or rewritten.
    bytes = verifyArchive(path.resolve(archive))
  } else {
    const cache = path.join(root, '.cache', 'postgres')
    rejectSymlinkAncestors(cache)
    fs.mkdirSync(cache, { recursive: true })
    const cached = path.join(cache, DISTRIBUTION.archive)
    if (!fs.existsSync(cached)) {
      const temporary = fs.mkdtempSync(path.join(cache, '.download-'))
      try {
        const downloaded = path.join(temporary, DISTRIBUTION.archive)
        await downloadArchive(downloaded)
        bytes = verifyArchive(downloaded)
        // Do not overwrite another builder's cache entry.
        fs.copyFileSync(downloaded, cached, fs.constants.COPYFILE_EXCL)
      } finally {
        fs.rmSync(temporary, { recursive: true, force: true })
      }
    }
    bytes = verifyArchive(cached)
  }
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('El bundle de PostgreSQL incluido en este instalador requiere Windows x64.')
  }
  const staging = fs.mkdtempSync(path.join(tauri, '.postgres-'))
  const backup = path.join(staging, 'previous')
  let movedPrevious = false
  try {
    const packed = path.join(staging, 'packed')
    fs.mkdirSync(packed)
    stageArchive(bytes, packed)
    copyVisualCppRuntime(packed)
    // Never merge into old resources: stale data/configuration must not survive.
    if (fs.existsSync(destination)) {
      retryWindowsIO(() => fs.renameSync(destination, backup))
      movedPrevious = true
    }
    try {
      retryWindowsIO(() => fs.renameSync(packed, destination))
    } catch (error) {
      if (movedPrevious) {
        retryWindowsIO(() => fs.renameSync(backup, destination))
        movedPrevious = false
      }
      if (['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) {
        throw new Error(
          `No se pudo actualizar ${destination}; cierra POS Retail/Tauri y vuelve a generar el instalador (${error.code}).`,
          { cause: error },
        )
      }
      throw error
    }
    movedPrevious = false
    return destination
  } finally {
    // Preserve the old bundle if an exceptional rollback failure left it here.
    if (!movedPrevious) fs.rmSync(staging, { recursive: true, force: true, maxRetries: 3 })
  }
}

function parseArgs(args) {
  if (args.length === 0) return {}
  if (args.length === 2 && args[0] === '--archive' && args[1] && !args[1].startsWith('--')) {
    return { archive: args[1] }
  }
  throw new Error('Usage: node scripts/prepare-postgres-dist.js [--archive <official-pinned.zip>]')
}

if (require.main === module) {
  Promise.resolve().then(() => preparePostgres(path.resolve(__dirname, '..'), parseArgs(process.argv.slice(2))))
    .then(destination => {
      console.log(`PostgreSQL ${DISTRIBUTION.version}-${DISTRIBUTION.revision} prepared: ${destination}`)
      console.warn('Review distribution.json for Microsoft runtime redistribution and PostgreSQL third-party license obligations before shipping.')
    })
    .catch(error => {
      console.error(`[prepare-postgres-dist] ${error.message}`)
      process.exitCode = 1
    })
}

module.exports = {
  DISTRIBUTION, REQUIRED_TOOLS, REQUIRED_CRT_DLLS, approvedUrl, verifyArchive, readZip,
  stageArchive, copyVisualCppRuntime, preparePostgres, parseArgs,
}
