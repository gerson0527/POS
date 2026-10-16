const fs = require('fs')
const path = require('path')

const iconsDir = path.join(__dirname, '..', 'src-tauri', 'icons')

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true })
}

// Valid PNG Base64 Buffer for web/png icons
const pngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSU5EUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAzSURBVHgB7cEBDEAMAMDAv7T3h6m0N+4gCRDSERmJdETGIh2RsUhHZCTSERmLdETGIn13tQEIAQF0K6JkAAAAAElFTkSuQmCC',
  'base64'
)

// Standard 32x32 32-bit BMP ICO format for Windows RC.EXE
const width = 32
const height = 32
const headerSize = 40
const pixelDataSize = width * height * 4 // 4096 bytes
const maskSize = width * 4 // 128 bytes (32 * 32 / 8)
const imageSize = headerSize + pixelDataSize + maskSize // 4264 bytes
const totalSize = 22 + imageSize // 4286 bytes

const icoBuffer = Buffer.alloc(totalSize)

// 1. ICONDIR (6 bytes)
icoBuffer.writeUInt16LE(0, 0) // Reserved
icoBuffer.writeUInt16LE(1, 2) // Type 1 = ICO
icoBuffer.writeUInt16LE(1, 4) // 1 image

// 2. ICONDIRENTRY (16 bytes)
icoBuffer.writeUInt8(width, 6)         // Width 32
icoBuffer.writeUInt8(height, 7)        // Height 32
icoBuffer.writeUInt8(0, 8)             // Color count (0 for >= 8bpp)
icoBuffer.writeUInt8(0, 9)             // Reserved
icoBuffer.writeUInt16LE(1, 10)         // Color planes (1)
icoBuffer.writeUInt16LE(32, 12)        // Bits per pixel (32)
icoBuffer.writeUInt32LE(imageSize, 14) // Size of image data (4264)
icoBuffer.writeUInt32LE(22, 18)        // Offset to image data (22)

// 3. BITMAPINFOHEADER (40 bytes)
let offset = 22
icoBuffer.writeUInt32LE(headerSize, offset)       // biSize (40)
icoBuffer.writeInt32LE(width, offset + 4)          // biWidth (32)
icoBuffer.writeInt32LE(height * 2, offset + 8)     // biHeight (64 = 32*2)
icoBuffer.writeUInt16LE(1, offset + 12)            // biPlanes (1)
icoBuffer.writeUInt16LE(32, offset + 14)           // biBitCount (32)
icoBuffer.writeUInt32LE(0, offset + 16)            // biCompression (0 = BI_RGB)
icoBuffer.writeUInt32LE(pixelDataSize + maskSize, offset + 20) // biSizeImage (4224)
icoBuffer.writeInt32LE(0, offset + 24)             // biXPelsPerMeter
icoBuffer.writeInt32LE(0, offset + 28)             // biYPelsPerMeter
icoBuffer.writeUInt32LE(0, offset + 32)            // biClrUsed
icoBuffer.writeUInt32LE(0, offset + 36)            // biClrImportant

// 4. XOR Color Data (4096 bytes) - Orange #FF6A00 (BGRA format)
offset = 22 + headerSize
for (let i = 0; i < width * height; i++) {
  icoBuffer.writeUInt8(0x00, offset + i * 4)     // Blue
  icoBuffer.writeUInt8(0x6a, offset + i * 4 + 1) // Green
  icoBuffer.writeUInt8(0xff, offset + i * 4 + 2) // Red
  icoBuffer.writeUInt8(0xff, offset + i * 4 + 3) // Alpha
}

// 5. AND Mask Data (128 bytes) - All zeroes (fully opaque)
offset = 22 + headerSize + pixelDataSize
icoBuffer.fill(0x00, offset, offset + maskSize)

fs.writeFileSync(path.join(iconsDir, '32x32.png'), pngBuffer)
fs.writeFileSync(path.join(iconsDir, '128x128.png'), pngBuffer)
fs.writeFileSync(path.join(iconsDir, '128x128@2x.png'), pngBuffer)
fs.writeFileSync(path.join(iconsDir, 'icon.png'), pngBuffer)
fs.writeFileSync(path.join(iconsDir, 'icon.icns'), pngBuffer)
fs.writeFileSync(path.join(iconsDir, 'icon.ico'), icoBuffer)

console.log('Standard 4286-byte Windows RC.EXE compatible ICO generated in src-tauri/icons/icon.ico')
