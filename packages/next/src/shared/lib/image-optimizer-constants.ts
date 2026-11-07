// Keep this outside server/image-optimizer/: standalone tracing excludes that
// directory when the hosting platform handles image optimization, but
// config.ts and config-shared.ts always need these constants.
// This also runs in image optimizer child processes, so keep it free of imports.

/** The default for `experimental.imgOptTimeoutInSeconds`. */
export const DEFAULT_IMG_OPT_TIMEOUT_IN_SECONDS = 7

/** The content types that nsio can encode. */
export const NSIO_OUTPUT_MIME_TYPES: readonly string[] = [
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]
