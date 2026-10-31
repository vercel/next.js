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
  if (
    [0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66].every(
      (b, i) => !b || buffer[i] === b
    )
  ) {
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
  if (
    [0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63].every(
      (b, i) => !b || buffer[i] === b
    )
  ) {
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
