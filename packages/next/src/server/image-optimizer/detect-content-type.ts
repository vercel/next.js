import { detector } from 'next/dist/compiled/image-detector/detector.js'
import {
  AVIF,
  BMP,
  GIF,
  HEIC,
  ICNS,
  ICO,
  JPEG,
  JP2,
  JXL,
  PDF,
  PNG,
  SVG,
  TIFF,
  WEBP,
} from './image-type'

// An ISO BMFF `ftyp` box is: size (4 bytes) + "ftyp" + major brand (4 bytes) +
// minor version (4 bytes) + compatible brands (4 bytes each). Real files have
// small, 4-byte aligned sizes, so reject anything else. This stops text such as
// `<!--ftypavif-->` (an SVG) from matching because the first 4 bytes of the
// size field were previously treated as a wildcard.
const FTYP_MIN_SIZE = 16
const FTYP_MAX_SIZE = 4096

function isFtypBrand(buffer: Buffer, brand: string): boolean {
  if (buffer.byteLength < 12) {
    return false
  }
  // `<` is never the start of an ISO BMFF box size, it starts markup (SVG/HTML).
  if (buffer[0] === 0x3c) {
    return false
  }
  const size = buffer.readUInt32BE(0)
  if (size < FTYP_MIN_SIZE || size > FTYP_MAX_SIZE || size % 4 !== 0) {
    return false
  }
  return buffer.toString('latin1', 4, 12) === `ftyp${brand}`
}

/**
 * Inspects the first few bytes of a buffer to determine if
 * it matches the "magic number" of known file signatures.
 * https://en.wikipedia.org/wiki/List_of_file_signatures
 */
export async function detectContentType(
  buffer: Buffer
): Promise<string | null> {
  if (buffer.byteLength === 0) {
    return null
  }
  if ([0xff, 0xd8, 0xff].every((b, i) => buffer[i] === b)) {
    return JPEG
  }
  if (
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (b, i) => buffer[i] === b
    )
  ) {
    return PNG
  }
  if ([0x47, 0x49, 0x46, 0x38].every((b, i) => buffer[i] === b)) {
    return GIF
  }
  if (
    [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50].every(
      (b, i) => !b || buffer[i] === b
    )
  ) {
    return WEBP
  }
  if ([0x3c, 0x3f, 0x78, 0x6d, 0x6c].every((b, i) => buffer[i] === b)) {
    return SVG
  }
  if ([0x3c, 0x73, 0x76, 0x67].every((b, i) => buffer[i] === b)) {
    return SVG
  }
  if (isFtypBrand(buffer, 'avif')) {
    return AVIF
  }
  if ([0x00, 0x00, 0x01, 0x00].every((b, i) => buffer[i] === b)) {
    return ICO
  }
  if ([0x69, 0x63, 0x6e, 0x73].every((b, i) => buffer[i] === b)) {
    return ICNS
  }
  if ([0x49, 0x49, 0x2a, 0x00].every((b, i) => buffer[i] === b)) {
    return TIFF
  }
  if ([0x42, 0x4d].every((b, i) => buffer[i] === b)) {
    return BMP
  }
  if ([0xff, 0x0a].every((b, i) => buffer[i] === b)) {
    return JXL
  }
  if (
    [
      0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a,
    ].every((b, i) => buffer[i] === b)
  ) {
    return JXL
  }
  if (isFtypBrand(buffer, 'heic')) {
    return HEIC
  }
  if ([0x25, 0x50, 0x44, 0x46, 0x2d].every((b, i) => buffer[i] === b)) {
    return PDF
  }
  if (
    [
      0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a,
    ].every((b, i) => buffer[i] === b)
  ) {
    return JP2
  }

  const format = detector(buffer.subarray(0, 1024))

  switch (format) {
    case 'webp':
      return WEBP
    case 'png':
      return PNG
    case 'jpg':
      return JPEG
    case 'gif':
      return GIF
    case 'svg':
      return SVG
    case 'jxl':
    case 'jxl-stream':
      return JXL
    case 'jp2':
      return JP2
    case 'tiff':
      return TIFF
    case 'bmp':
      return BMP
    case 'ico':
      return ICO
    case 'icns':
      return ICNS
    case 'heif':
    case 'cur':
    case 'dds':
    case 'j2c':
    case 'ktx':
    case 'pnm':
    case 'psd':
    case 'tga':
    case undefined:
      return null // unsupported formats
    default:
      format satisfies never // exhaustive check
      return null // impossible to reach
  }
}
