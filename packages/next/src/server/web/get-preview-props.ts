import type { __ApiPreviewProps } from '../api-utils'

/**
 * The previewProps value is set to env variables during build in define-env.
 */
export function getPreviewProps(): __ApiPreviewProps {
  if (!process.env.__NEXT_PREVIEW_MODE_ID) {
    throw new Error(
      '__NEXT_PREVIEW_MODE_ID is not set. This is a bug in Next.js'
    )
  }
  if (!process.env.__NEXT_PREVIEW_MODE_SIGNING_KEY) {
    throw new Error(
      '__NEXT_PREVIEW_MODE_SIGNING_KEY is not set. This is a bug in Next.js'
    )
  }
  if (!process.env.__NEXT_PREVIEW_MODE_ENCRYPTION_KEY) {
    throw new Error(
      '__NEXT_PREVIEW_MODE_ENCRYPTION_KEY is not set. This is a bug in Next.js'
    )
  }

  return {
    previewModeId: process.env.__NEXT_PREVIEW_MODE_ID,
    previewModeSigningKey: process.env.__NEXT_PREVIEW_MODE_SIGNING_KEY,
    previewModeEncryptionKey: process.env.__NEXT_PREVIEW_MODE_ENCRYPTION_KEY,
  }
}
