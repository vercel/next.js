import zlib from 'zlib'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function createChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  const crcValue = calculateCRC(Buffer.concat([Buffer.from(type), data])) >>> 0 // Ensure unsigned 32-bit integer
  crc.writeUInt32BE(crcValue, 0)
  return Buffer.concat([length, Buffer.from(type), data, crc])
}

function calculateCRC(data) {
  let crc = 0xffffffff
  for (const b of data) {
    crc ^= b
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return crc ^ 0xffffffff
}

export function generatePNG(targetSizeMB) {
  const targetSizeBytes = targetSizeMB * 1024 * 1024

  let width = 2048,
    height = 1024
  let pngFile: Buffer

  do {
    const ihdrData = Buffer.alloc(13)
    ihdrData.writeUInt32BE(width, 0)
    ihdrData.writeUInt32BE(height, 4)
    ihdrData.writeUInt8(8, 8) // bitDepth
    ihdrData.writeUInt8(6, 9) // colorType
    ihdrData.writeUInt8(0, 10) // compressionMethod
    ihdrData.writeUInt8(0, 11) // filterMethod
    ihdrData.writeUInt8(0, 12) // interlaceMethod

    const ihdrChunk = createChunk('IHDR', ihdrData)

    const rowSize = width * 4 + 1
    const imageData = Buffer.alloc(rowSize * height)

    for (let y = 0; y < height; y++) {
      imageData[y * rowSize] = 0
      for (let x = 0; x < width; x++) {
        const idx = y * rowSize + 1 + x * 4
        imageData[idx] = (Math.random() * 256) | 0
        imageData[idx + 1] = (Math.random() * 256) | 0
        imageData[idx + 2] = (Math.random() * 256) | 0
        imageData[idx + 3] = 255
      }
    }

    const compressedImageData = zlib.deflateSync(imageData)
    const idatChunk = createChunk('IDAT', compressedImageData)
    const iendChunk = createChunk('IEND', Buffer.alloc(0))

    pngFile = Buffer.concat([PNG_SIGNATURE, ihdrChunk, idatChunk, iendChunk])

    if (pngFile.length < targetSizeBytes) {
      width *= 2
      height *= 2
    }
  } while (pngFile.length < targetSizeBytes)

  return pngFile
}
