/**
 * Tries to get the preview data on the request for the given route. This
 * isn't enabled in the edge runtime yet.
 */
export const tryGetPreviewData:
  | typeof import('../../../../api-utils/node').tryGetPreviewData
  | null =
  process.env.NEXT_RUNTIME !== 'edge'
    ? require('../../../../api-utils/node').tryGetPreviewData
    : null
