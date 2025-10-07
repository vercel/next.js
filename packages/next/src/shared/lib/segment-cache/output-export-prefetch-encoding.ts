// In output: export mode, the build id is added to the start of the HTML
// document, directly after the doctype declaration. During a prefetch, the
// client performs a range request to get the build id, so it can check whether
// the target page belongs to the same build.
//
// The first 64 bytes of the document are requested. The exact number isn't
// too important; it must be larger than the build id + doctype + closing and
// ending comment markers, but it doesn't need to match the end of the
// comment exactly.
//
// Build ids are 21 bytes long in the default implementation, though this
// can be overridden in the Next.js config. For the purposes of this check,
// it's OK to only match the start of the id, so we'll truncate it if exceeds
// a certain length.

const DOCTYPE_PREFIX = '<!DOCTYPE html>' // 15 bytes
const MAX_BUILD_ID_LENGTH = 24

// Request the first 64 bytes. The Range header is inclusive of the end value.
export const DOC_PREFETCH_RANGE_HEADER_VALUE = 'bytes=0-63'

function escapeBuildId(buildId: string) {
  // If the build id is longer than the given limit, it's OK for our purposes
  // to only match the beginning.
  const truncated = buildId.slice(0, MAX_BUILD_ID_LENGTH)
  // Replace hyphens with underscores so it doesn't break the HTML comment.
  // (Unlikely, but if this did happen it would break the whole document.)
  return truncated.replace(/-/g, '_')
}

export function insertBuildIdComment(originalHtml: string, buildId: string) {
  if (
    // Skip if the build id contains a closing comment marker.
    buildId.includes('-->') ||
    // React always inserts a doctype at the start of the document. Skip if it
    // isn't present. Shouldn't happen; suggests an issue elsewhere.
    !originalHtml.startsWith(DOCTYPE_PREFIX)
  ) {
    // Return the original HTML unchanged. This means the document will not
    // be prefetched.
    // TODO: The build id comment is currently only used during prefetches, but
    // if we eventually use this mechanism for regular navigations, we may need
    // to error during build if we fail to insert it for some reason.
    return originalHtml
  }
  // The comment must be inserted after the doctype.
  return originalHtml.replace(
    DOCTYPE_PREFIX,
    DOCTYPE_PREFIX + '<!--' + escapeBuildId(buildId) + '-->'
  )
}

export function doesExportedHtmlMatchBuildId(
  partialHtmlDocument: string,
  buildId: string
) {
  // Check whether the document starts with the expected buildId.
  return partialHtmlDocument.startsWith(
    DOCTYPE_PREFIX + '<!--' + escapeBuildId(buildId) + '-->'
  )
}
