// Use dynamic import to test that chunk loading works in worker
// This exercises the ASSET_SUFFIX mechanism for loading chunks
async function verifyPng() {
  const pngModule = await import('./test-image.png')
  const pngUrl = pngModule.default

  const fullUrl = new URL(pngUrl.src, location.origin).toString()
  const response = await fetch(fullUrl)
  const contentType = response.headers.get('content-type')
  const contentLength = response.headers.get('content-length')

  self.postMessage({
    url: pngUrl.src,
    width: pngUrl.width,
    height: pngUrl.height,
    // Verification that we actually fetched it
    fetchedFrom: fullUrl,
    contentType,
    contentLength: contentLength ? parseInt(contentLength, 10) : null,
    status: response.status,
  })
}

verifyPng()
