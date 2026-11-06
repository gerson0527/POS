const fs = require('fs')
const os = require('os')
const path = require('path')

function requireFile(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`Falta el archivo requerido: ${file}`)
  }
}

function requireDirectory(directory) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error(`Falta el directorio requerido: ${directory}`)
  }
}

function findServerRoot(standalone, buildId) {
  const candidates = []
  function visit(directory) {
    const server = path.join(directory, 'server.js')
    const id = path.join(directory, '.next', 'BUILD_ID')
    if (fs.existsSync(server) && fs.statSync(server).isFile() && fs.existsSync(id) &&
        fs.readFileSync(id, 'utf8').trim() === buildId &&
        fs.existsSync(path.join(directory, '.next', 'server'))) {
      candidates.push(directory)
    }
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      // No confundir servidores de dependencias con el entrypoint generado por Next.
      if (entry.isDirectory() && !['node_modules', '.next', 'public'].includes(entry.name) &&
          !entry.name.startsWith('.')) {
        visit(path.join(directory, entry.name))
      }
    }
  }
  visit(standalone)
  if (candidates.length !== 1) {
    throw new Error(
      `No se pudo identificar una raíz standalone única para BUILD_ID ${buildId}: ` +
      `${candidates.length} coincidencias (${candidates.join(', ') || 'ninguna'}). ` +
      'Ejecuta next build con output: standalone antes de preparar Tauri.'
    )
  }
  return candidates[0]
}

function retryWindowsIO(operation, attempts = 5, delay = 100) {
  for (let attempt = 1; ; attempt++) {
    try {
      return operation()
    } catch (error) {
      if (attempt >= attempts || !['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) {
        throw error
      }
      // Defender/indexadores pueden bloquear temporalmente archivos recién copiados.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay * attempt)
    }
  }
}

function removeTree(target) {
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

function writeDesktopBootstrap(root) {
  const out = path.join(root, 'out')
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#fafafa">
  <title>POS Retail</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: "Segoe UI", Geist, -apple-system, BlinkMacSystemFont, sans-serif;
      color: #09090b;
      background: #fafafa;
      font-synthesis: none;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }
    * { box-sizing: border-box; }
    body {
      min-width: 320px;
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 32px 20px;
      background:
        radial-gradient(ellipse at 50% 42%, rgba(234, 88, 12, .07), transparent 42%),
        #fafafa;
    }
    main {
      width: min(100%, 440px);
      padding: 40px 36px 32px;
      text-align: center;
      background: rgba(255, 255, 255, .92);
      border: 1px solid #e4e4e7;
      border-radius: 12px;
      box-shadow: 0 18px 55px rgba(24, 24, 27, .08), 0 2px 8px rgba(24, 24, 27, .04);
    }
    .brand {
      display: grid;
      width: 52px;
      height: 52px;
      place-items: center;
      margin: 0 auto 20px;
      color: #fff;
      background: #ea580c;
      border-radius: 10px;
      box-shadow: 0 8px 20px rgba(234, 88, 12, .22);
    }
    .brand svg { width: 28px; height: 28px; }
    .eyebrow {
      margin: 0 0 8px;
      color: #ea580c;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .14em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      color: #09090b;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -.035em;
    }
    .description {
      margin: 9px 0 0;
      color: #71717a;
      font-size: 13px;
      line-height: 1.6;
    }
    .progress {
      display: flex;
      min-height: 42px;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-top: 28px;
      padding: 10px 12px;
      color: #52525b;
      background: #f4f4f5;
      border: 1px solid #e4e4e7;
      border-radius: 7px;
      font-size: 12px;
    }
    .spinner {
      width: 15px;
      height: 15px;
      flex: 0 0 auto;
      border: 2px solid #fed7aa;
      border-top-color: #ea580c;
      border-radius: 50%;
      animation: spin .8s linear infinite;
    }
    .error {
      display: none;
      margin-top: 22px;
      padding: 12px 14px;
      color: #b91c1c;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 7px;
      font-size: 12px;
      line-height: 1.55;
      overflow-wrap: anywhere;
    }
    button {
      display: none;
      width: 100%;
      margin-top: 12px;
      padding: 11px 16px;
      color: #fff;
      background: #ea580c;
      border: 0;
      border-radius: 7px;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: #c2410c; }
    footer {
      margin-top: 24px;
      color: #a1a1aa;
      font-size: 10px;
      letter-spacing: .04em;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-color-scheme: dark) {
      :root { color: #fafafa; background: #0b0b0b; }
      body {
        background:
          radial-gradient(ellipse at 50% 42%, rgba(255, 106, 0, .1), transparent 42%),
          #0b0b0b;
      }
      main {
        background: rgba(20, 20, 20, .94);
        border-color: #292929;
        box-shadow: 0 18px 55px rgba(0, 0, 0, .3);
      }
      .brand { background: #ff6a00; box-shadow: 0 8px 20px rgba(255, 106, 0, .2); }
      .eyebrow { color: #ff812f; }
      h1 { color: #fafafa; }
      .description, .progress { color: #a1a1aa; }
      .progress { background: #171717; border-color: #292929; }
      .spinner { border-color: #7c2d12; border-top-color: #ff812f; }
      .error { color: #fca5a5; background: #291515; border-color: #542323; }
      button { background: #ff6a00; }
      button:hover { background: #ff812f; }
      footer { color: #71717a; }
    }
    @media (max-width: 480px) {
      main { padding: 32px 22px 26px; }
      h1 { font-size: 20px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .spinner { animation-duration: 2s; }
    }
  </style>
</head>
<body>
  <main>
    <div class="brand" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M5 19V5h7.2a4.2 4.2 0 0 1 0 8.4H9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="m13 13 6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
      </svg>
    </div>
    <p class="eyebrow">Punto de venta · DIAN</p>
    <h1>POS Retail Enterprise</h1>
    <p class="description">Sistema de punto de venta y facturación electrónica</p>
    <div class="progress" role="status" aria-live="polite">
      <span class="spinner" id="spinner" aria-hidden="true"></span>
      <span id="status">Preparando el sistema…</span>
    </div>
    <div class="error" id="error" role="alert"></div>
    <button id="retry" type="button" onclick="window.location.reload()">Reintentar inicio</button>
    <footer>POS RETAIL ENTERPRISE DIAN</footer>
  </main>
  <script>
    (async () => {
      const status = document.getElementById('status')
      try {
        const invoke = window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke
        if (!invoke) throw new Error('No se pudo conectar con el servicio de escritorio.')
        await invoke('start_backend_server')
        const response = await fetch('http://127.0.0.1:3000/api/setup')
        const readiness = await response.json()
        if (!response.ok) {
          throw new Error(readiness.error || 'No se pudo verificar la configuración inicial del POS.')
        }
        if (readiness.databaseConfigured && !readiness.dbConnected) {
          throw new Error(readiness.error || 'No se pudo conectar con la base de datos configurada.')
        }
        const destination = !readiness.databaseConfigured || readiness.setupRequired ? '/desktop-setup' : '/'
        window.location.replace('http://127.0.0.1:3000' + destination)
      } catch (error) {
        document.getElementById('spinner').style.display = 'none'
        document.getElementById('error').style.display = 'block'
        document.getElementById('error').textContent =
          'No se pudo iniciar el sistema: ' + (error && error.message ? error.message : String(error))
        document.getElementById('retry').style.display = 'block'
      }
    })()
  </script>
</body>
</html>
`, 'utf8')
}

function copyRuntime(source, destination) {
  retryWindowsIO(() => fs.cpSync(source, destination, {
    recursive: true,
    dereference: true,
    force: true,
    filter: (file) => {
      const name = path.basename(file)
      // La configuración pertenece a app_local_data_dir/.env, nunca al bundle.
      if (/^\.env(?:\.|$)/i.test(name) || ['.npmrc', '.yarnrc', '.yarnrc.yml'].includes(name)) return false
      const parts = path.relative(source, file).split(path.sep)
      if (parts.some((part) => ['.git', '.svn', '.hg'].includes(part))) return false
      // No podar dependencias por nombres de carpetas como "out" o "src-tauri".
      if (parts.includes('node_modules')) return true
      // El tracing de process.cwd() puede incluir el proyecto entero, incluso el
      // backend de una ejecución anterior: evitar tamaño recursivo y artefactos Rust.
      const nextIndex = parts.indexOf('.next')
      const projectParts = nextIndex === -1 ? parts : parts.slice(0, nextIndex)
      if (projectParts.some((part) => ['src-tauri', 'dist-installers', 'out', 'postman-dian', 'test', '.vercel', '.agents', '.zed', '.vscode', '.idea'].includes(part) || part.startsWith('.backend-'))) return false
      if (projectParts.some((part, index) => part === 'archive' && projectParts[index - 1] === 'scripts')) return false
      if (parts.length === 1 && [
        'ARQUITECTURA_POS_DIAN_COLOMBIA.md',
        'DIAGNOSTICO_FACTURACION_FACTUS.md',
        'build-installer.bat',
        'components.json',
        'docker-compose.override.yml',
        'docker-compose.yml',
        'Dockerfile',
        'Dockerfile.dev',
        'drizzle.config.ts',
        'package-lock.json',
        'skills-lock.json',
        'setup-database.bat',
        'start-tauri.bat',
        'start.bat',
        'stop.bat',
        'tsconfig.json',
        'tsconfig.tsbuildinfo',
        'vercel.json',
        'vitest.config.ts',
      ].includes(parts[0])) return false
      if (parts.some((part, index) => part === '.next' && ['standalone', 'cache', 'dev'].includes(parts[index + 1]))) return false
      return true
    },
  }))
}

function prepareDevResources(root) {
  const tauri = path.join(root, 'src-tauri')
  requireDirectory(tauri)
  const backend = path.join(tauri, 'backend')
  if (!fs.existsSync(backend)) {
    fs.mkdirSync(backend, { recursive: true })
    fs.writeFileSync(path.join(backend, 'README-dev.txt'),
      'Recurso mínimo para cargo check/dev. No contiene un backend de producción.\n' +
      'Para empaquetar, ejecuta npm run build; prepare-tauri-dist reemplaza este contenido.\n')
  }
  requireDirectory(backend)
  return backend
}

function prepareBackend(root, nodeExecutable) {
  const next = path.join(root, '.next')
  const standalone = path.join(next, 'standalone')
  requireDirectory(standalone)
  requireFile(path.join(next, 'BUILD_ID'))
  const buildId = fs.readFileSync(path.join(next, 'BUILD_ID'), 'utf8').trim()
  if (!buildId) throw new Error('El BUILD_ID de Next está vacío; vuelve a ejecutar next build.')
  const serverRoot = findServerRoot(standalone, buildId)
  const relativeRoot = path.relative(standalone, serverRoot)
  if (relativeRoot && fs.existsSync(path.join(standalone, 'server.js'))) {
    throw new Error('El standalone contiene otro server.js en la raíz; no se sobrescribirá con un launcher.')
  }
  requireDirectory(path.join(next, 'static'))
  requireDirectory(path.join(root, 'public'))
  const migrations = path.join(root, 'drizzle')
  const journalFile = path.join(migrations, 'meta', '_journal.json')
  requireFile(journalFile)
  const journal = JSON.parse(fs.readFileSync(journalFile, 'utf8'))
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new Error(`El journal de migraciones está vacío o es inválido: ${journalFile}`)
  }
  for (const entry of journal.entries) {
    if (typeof entry.tag !== 'string' || !/^[\w-]+$/.test(entry.tag)) {
      throw new Error(`Tag de migración inválido en ${journalFile}`)
    }
    requireFile(path.join(migrations, `${entry.tag}.sql`))
  }
  requireFile(nodeExecutable)

  const tauri = path.join(root, 'src-tauri')
  requireDirectory(tauri)
  const destination = path.join(tauri, 'backend')
  const staging = fs.mkdtempSync(path.join(tauri, '.backend-'))
  try {
    // Conservar TODO el árbol mantiene la resolución de node_modules ascendentes
    // en builds con outputFileTracingRoot/monorepos. No aplanar dependencias.
    copyRuntime(standalone, staging)
    const app = path.join(staging, relativeRoot)
    for (const [source, target] of [
      [path.join(root, 'public'), path.join(app, 'public')],
      [path.join(next, 'static'), path.join(app, '.next', 'static')],
      [migrations, path.join(app, 'drizzle')],
    ]) {
      removeTree(target)
      copyRuntime(source, target)
    }
    if (relativeRoot) {
      // El server de Next hace chdir a su propia raíz: static, public y drizzle
      // deben estar allí. import() funciona con package.json CommonJS o ESM.
      const entry = './' + relativeRoot.split(path.sep).map(encodeURIComponent).join('/') + '/server.js'
      fs.writeFileSync(path.join(staging, 'server.js'),
        `// Entrypoint estable para el runtime Tauri; no carga archivos .env.\n` +
        `import(${JSON.stringify(entry)}).catch((error) => {\n` +
        `  console.error('No se pudo iniciar el backend Next:', error)\n` +
        `  process.exitCode = 1\n` +
        `})\n`)
    }
    retryWindowsIO(() => fs.copyFileSync(nodeExecutable, path.join(staging, 'node.exe')))
    requireFile(path.join(staging, 'server.js'))
    // No renombrar ni eliminar la raíz: Windows puede mantener un handle sobre
    // backend (por ejemplo, el cwd del runtime). Limpiar hijos evita residuos.
    fs.mkdirSync(destination, { recursive: true })
    try {
      for (const entry of fs.readdirSync(destination)) removeTree(path.join(destination, entry))
      copyRuntime(staging, destination)
      requireFile(path.join(destination, 'server.js'))
      requireFile(path.join(destination, 'node.exe'))
    } catch (error) {
      throw new Error(`No se pudo actualizar ${destination} (${error.code || error.message}). ` +
        'Cierra la aplicación Tauri y su backend Node si siguen ejecutándose y vuelve a preparar el bundle.', { cause: error })
    }
  } finally {
    removeTree(staging)
  }

  // frontendDist is only the embedded launcher; Next serves the actual UI.
  writeDesktopBootstrap(root)
  return { destination, relativeRoot }
}

// Sin build previo: node scripts/prepare-tauri-dist.js --prepare-dev (antes de cargo check/dev).
// Pruebas sin Next, PostgreSQL ni procesos hijos: node scripts/prepare-tauri-dist.js --self-test
function selfTest() {
  const assert = require('node:assert/strict')
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-tauri-staging-'))
  const originalRename = fs.renameSync
  const originalCopy = fs.cpSync
  fs.renameSync = () => assert.fail('El staging no debe renombrar directorios')
  const write = (root, file, content = 'fixture') => {
    const target = path.join(root, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
  }
  function fixture(name, app = '') {
    const root = path.join(temp, name)
    for (const [file, content] of [
      ['.next/BUILD_ID', 'test-build'],
      [`.next/standalone/${app}server.js`, '// Next server fixture'],
      [`.next/standalone/${app}.next/BUILD_ID`, 'test-build'],
      [`.next/standalone/${app}.next/server/app.js`, 'server'],
      ['.next/standalone/node_modules/example/index.js', 'dependency'],
      ['.next/standalone/.env', 'SECRET=do-not-bundle'],
      ['.next/standalone/.git/config', 'private git metadata'],
      ['.next/standalone/.npmrc', 'private registry config'],
      ['.next/standalone/src-tauri/target/debug/build.bin', 'Rust artifact'],
      ['.next/standalone/src-tauri/backend/old.bin', 'recursive backend'],
      ['.next/standalone/dist-installers/installer.exe', 'installer'],
      ['.next/standalone/postman-dian/collection.json', 'private API collection'],
      ['.next/standalone/test/fixture.test.ts', 'test fixture'],
      ['.next/standalone/scripts/archive/debug-db.js', 'archived diagnostic script'],
      ['.next/standalone/build-installer.bat', 'build script'],
      ['.next/standalone/.next/cache/old.bin', 'cache'],
      ['.next/standalone/.next/server/app/out/page.js', 'compiled route, not an export directory'],
      ['.next/standalone/node_modules/example/out/index.js', 'required dependency'],
      ['.next/standalone/node_modules/example/src-tauri/asset.bin', 'required dependency'],
      ['.next/standalone/node_modules/example/.env.local', 'SECRET=do-not-bundle'],
      [`.next/standalone/${app}.env.production.local`, 'SECRET=do-not-bundle'],
      ['.next/static/chunks/app.js', 'static'],
      ['public/logo.svg', 'public'],
      ['drizzle/meta/_journal.json', '{"entries":[{"tag":"0000_test"}]}'],
      ['drizzle/0000_test.sql', 'SELECT 1;'],
      ['build-node.exe', 'node binary fixture'],
      ['src-tauri/backend/obsolete.txt', 'stale'],
      ['src-tauri/backend/.env', 'OLD_SECRET=do-not-bundle'],
    ]) write(root, file, content)
    return root
  }
  try {
    for (const [name, app] of [['flat', ''], ['nested', 'apps/pos/']]) {
      const root = fixture(name, app)
      const node = path.join(root, 'build-node.exe')
      const { destination, relativeRoot } = prepareBackend(root, node)
      assert.equal(relativeRoot, app ? path.join(...app.split('/').filter(Boolean)) : '')
      for (const file of ['server.js', 'node.exe', 'node_modules/example/index.js',
              'node_modules/example/out/index.js', 'node_modules/example/src-tauri/asset.bin',
              '.next/server/app/out/page.js',
        `${app}public/logo.svg`, `${app}.next/static/chunks/app.js`,
        `${app}drizzle/meta/_journal.json`, `${app}drizzle/0000_test.sql`]) {
        requireFile(path.join(destination, file))
      }
      assert.equal(fs.readFileSync(path.join(destination, 'node.exe'), 'utf8'), fs.readFileSync(node, 'utf8'))
      for (const file of ['obsolete.txt', '.env', `${app}.env.production.local`,
              '.git', '.npmrc', 'src-tauri', 'dist-installers', '.next/cache', 'node_modules/example/.env.local']) {
        assert.equal(fs.existsSync(path.join(destination, file)), false)
      }
      for (const file of ['postman-dian', 'test', 'scripts/archive', 'build-installer.bat']) {
        assert.equal(fs.existsSync(path.join(destination, file)), false)
      }
      if (app) assert.ok(fs.readFileSync(path.join(destination, 'server.js'), 'utf8').includes('./apps/pos/server.js'))
      requireFile(path.join(root, 'out/index.html'))
      const bootstrap = fs.readFileSync(path.join(root, 'out/index.html'), 'utf8')
      assert.match(bootstrap, /start_backend_server/)
      assert.match(bootstrap, /127\.0\.0\.1:3000/)
      assert.match(bootstrap, /prefers-color-scheme: dark/)
      assert.match(bootstrap, /Reintentar inicio/)
      assert.match(bootstrap, /Preparando el sistema/)
      write(root, 'src-tauri/backend/stale-again.txt')
      prepareBackend(root, node)
      assert.equal(fs.existsSync(path.join(destination, 'stale-again.txt')), false)
    }
    for (const [name, mutate, expected] of [
      ['missing-build', (root) => fs.rmSync(path.join(root, '.next/BUILD_ID')), /Falta el archivo/],
      ['wrong-build', (root) => write(root, '.next/standalone/.next/BUILD_ID', 'old-build'), /0 coincidencias/],
      ['ambiguous', (root) => {
        write(root, '.next/standalone/other/server.js')
        write(root, '.next/standalone/other/.next/BUILD_ID', 'test-build')
        write(root, '.next/standalone/other/.next/server/app.js')
      }, /2 coincidencias/],
      ['missing-sql', (root) => fs.rmSync(path.join(root, 'drizzle/0000_test.sql')), /0000_test\.sql/],
      ['missing-static', (root) => fs.rmSync(path.join(root, '.next/static'), { recursive: true }), /Falta el directorio/],
    ]) {
      const root = fixture(name)
      mutate(root)
      assert.throws(() => prepareBackend(root, path.join(root, 'build-node.exe')), expected)
      requireFile(path.join(root, 'src-tauri/backend/obsolete.txt'))
    }
    const retryRoot = fixture('retry-copy')
    const retryDestination = path.join(retryRoot, 'src-tauri', 'backend')
    let copies = 0
    fs.cpSync = (source, destination, options) => {
      if (destination === retryDestination && ++copies <= 2) {
        throw Object.assign(new Error('Bloqueo transitorio simulado'), { code: 'EPERM' })
      }
      return originalCopy(source, destination, options)
    }
    prepareBackend(retryRoot, path.join(retryRoot, 'build-node.exe'))
    assert.equal(copies, 3)
    fs.cpSync = originalCopy
    const failure = Object.assign(new Error('No reintentar errores ajenos a locks'), { code: 'EINVAL' })
    let attempts = 0
    assert.throws(() => retryWindowsIO(() => { attempts++; throw failure }), (error) => error === failure)
    assert.equal(attempts, 1)
    attempts = 0
    const locked = Object.assign(new Error('Lock persistente'), { code: 'EBUSY' })
    assert.throws(() => retryWindowsIO(() => { attempts++; throw locked }, 3, 0), (error) => error === locked)
    assert.equal(attempts, 3)

    const devRoot = fixture('dev')
    removeTree(path.join(devRoot, 'src-tauri/backend'))
    const devBackend = prepareDevResources(devRoot)
    requireFile(path.join(devBackend, 'README-dev.txt'))
    assert.equal(fs.existsSync(path.join(devBackend, 'server.js')), false)
    prepareBackend(devRoot, path.join(devRoot, 'build-node.exe'))
    assert.equal(fs.existsSync(path.join(devBackend, 'README-dev.txt')), false)
    prepareDevResources(devRoot)
    requireFile(path.join(devBackend, 'server.js'))
    assert.equal(fs.existsSync(path.join(devBackend, 'README-dev.txt')), false)
    console.log('✔ Self-test: staging plano/anidado sin rename, recursos, Node, exclusiones, limpieza, retries, errores y recursos dev verificados.')
  } finally {
    fs.renameSync = originalRename
    fs.cpSync = originalCopy
    removeTree(temp)
  }
}

if (require.main === module) {
  try {
    if (process.argv.includes('--self-test')) {
      selfTest()
    } else if (process.argv.includes('--prepare-dev')) {
      const backend = prepareDevResources(path.resolve(__dirname, '..'))
      console.log(`✔ Recurso para cargo check/dev disponible en ${backend}; no sustituye el build de producción.`)
    } else {
      if (process.platform !== 'win32' || path.basename(process.execPath).toLowerCase() !== 'node.exe') {
        throw new Error('El bundle Windows debe prepararse en Windows usando node.exe; se copia process.execPath, no un Node del PATH.')
      }
      const result = prepareBackend(path.resolve(__dirname, '..'), process.execPath)
      console.log(`✔ Backend standalone y node.exe preparados en ${result.destination}`)
      if (result.relativeRoot) console.log(`  Raíz Next detectada: ${result.relativeRoot}`)
    }
  } catch (error) {
    console.error(`[prepare-tauri-dist] ${error.message}`)
    process.exitCode = 1
  }
}
