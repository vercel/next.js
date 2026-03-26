import { createNextUploadHandler } from '@pompelmi/next-upload'
import {
  CommonHeuristicsScanner,
  composeScanners,
  createZipBombGuard,
} from 'pompelmi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const policy = {
  includeExtensions: ['zip', 'png', 'jpg', 'jpeg', 'pdf', 'txt'],
  allowedMimeTypes: [
    'application/zip',
    'image/png',
    'image/jpeg',
    'application/pdf',
    'text/plain',
  ],
  maxFileSizeBytes: 20 * 1024 * 1024,
  failClosed: true,
}

const scanner = composeScanners(
  [
    [
      'zipGuard',
      createZipBombGuard({
        maxEntries: 512,
        maxTotalUncompressedBytes: 100 * 1024 * 1024,
        maxCompressionRatio: 12,
      }),
    ],
    ['heuristics', CommonHeuristicsScanner],
  ],
  { stopOn: 'suspicious' }
)

export const POST = createNextUploadHandler({
  ...policy,
  scanner,
})