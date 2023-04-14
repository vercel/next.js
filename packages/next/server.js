const serverExports = {
  NextRequest: require('next/dist/server/web/spec-extension/request')
    .NextRequest,
  NextResponse: require('next/dist/server/web/spec-extension/response')
    .NextResponse,
  ImageResponse: require('next/dist/server/web/spec-extension/image-response')
    .ImageResponse,
  unstable_cache: require('next/dist/server/web/spec-extension/cache')
    .unstable_cache,
  revalidateTag: require('next/dist/server/web/spec-extension/revalidate-tag')
    .revalidateTag,
  revalidatePath: require('next/dist/server/web/spec-extension/revalidate-path')
    .revalidatePath,
  userAgentFromString: require('next/dist/server/web/spec-extension/user-agent')
    .userAgentFromString,
  userAgent: require('next/dist/server/web/spec-extension/user-agent')
    .userAgent,
}

if (typeof URLPattern !== 'undefined') {
  // eslint-disable-next-line no-undef
  serverExports.URLPattern = URLPattern
}

// https://nodejs.org/api/esm.html#commonjs-namespaces
// When importing CommonJS modules, the module.exports object is provided as the default export
module.exports = serverExports

// make import { xxx } from 'next/server' work
exports.NextRequest = serverExports.NextRequest
exports.NextResponse = serverExports.NextResponse
exports.ImageResponse = serverExports.ImageResponse
exports.unstable_cache = serverExports.unstable_cache
exports.revalidatePath = serverExports.revalidatePath
exports.revalidateTag = serverExports.revalidateTag
exports.userAgentFromString = serverExports.userAgentFromString
exports.userAgent = serverExports.userAgent
exports.URLPattern = serverExports.URLPattern
