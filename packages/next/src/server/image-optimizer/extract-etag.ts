import { createHash } from 'crypto'

export function getHash(items: (string | number | Buffer)[]) {
  const hash = createHash('sha256')
  for (let item of items) {
    if (typeof item === 'number') hash.update(String(item))
    else {
      hash.update(item)
    }
  }
  // See https://en.wikipedia.org/wiki/Base64#URL_applications
  return hash.digest('base64url')
}

export function extractEtag(
  etag: string | null | undefined,
  imageBuffer: Buffer
) {
  if (etag) {
    // upstream etag needs to be base64url encoded due to weak etag signature
    // as we store this in the cache-entry file name.
    return Buffer.from(etag).toString('base64url')
  }
  return getImageEtag(imageBuffer)
}

export function getImageEtag(image: Buffer) {
  return getHash([image])
}
