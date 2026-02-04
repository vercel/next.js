/* eslint-env jest */
import { extractEtag, getImageEtag } from 'next/dist/server/image-optimizer'
import { readFile } from 'fs-extra'
import { join } from 'path'

describe('extractEtag', () => {
  it('should return base64url encoded etag if etag is provided', () => {
    const etag = 'sample-etag'
    const result = extractEtag(etag, Buffer.from(''))
    expect(result).toEqual('c2FtcGxlLWV0YWc')
  })

  it('should not return weak etag identifier if etag is provided', () => {
    const etag = 'W/"sample-etag"'
    const result = extractEtag(etag, Buffer.from(''))
    expect(result).toEqual('Vy8ic2FtcGxlLWV0YWci')
  })

  it('should call getImageEtag and return its result if etag is null', async () => {
    const buffer = await readFile(join(__dirname, './images/test.jpg'))
    const res = extractEtag(null, buffer)
    expect(res).toBe(getImageEtag(buffer))
  })

  it('should call getImageEtag and return its result if etag is undefined', async () => {
    const buffer = await readFile(join(__dirname, './images/test.jpg'))

    const res = extractEtag(undefined, buffer)
    expect(res).toBe(getImageEtag(buffer))
  })
  it('should call getImageEtag and return its result if etag is an empty string', async () => {
    const buffer = await readFile(join(__dirname, './images/test.jpg'))
    const res = extractEtag('', buffer)
    expect(res).toBe(getImageEtag(buffer))
  })
})
