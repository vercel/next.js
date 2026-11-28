import { checkIsOnDemandRevalidate } from 'next/dist/server/api-utils'
import {
  PRERENDER_REVALIDATE_HEADER,
  PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER,
} from 'next/dist/lib/constants'

describe('checkIsOnDemandRevalidate', () => {
  const previewProps = {
    previewModeId: 'test-preview-id',
    previewModeEncryptionKey: 'test-enc-key',
    previewModeSigningKey: 'test-sign-key',
  }

  it('safely handles null-prototype headers (e.g. Object.create(null))', () => {
    const headers = Object.create(null)
    headers[PRERENDER_REVALIDATE_HEADER] = 'test-preview-id'
    headers[PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER] = '1'

    const result = checkIsOnDemandRevalidate(headers, previewProps)
    expect(result).toEqual({
      isOnDemandRevalidate: true,
      revalidateOnlyGenerated: true,
    })
  })

  it('handles standard plain object headers', () => {
    const headers = {
      [PRERENDER_REVALIDATE_HEADER]: 'test-preview-id',
      [PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER]: '1',
    }

    const result = checkIsOnDemandRevalidate(headers, previewProps)
    expect(result).toEqual({
      isOnDemandRevalidate: true,
      revalidateOnlyGenerated: true,
    })
  })

  it('returns false for revalidateOnlyGenerated when header is omitted on null-prototype object', () => {
    const headers = Object.create(null)
    headers[PRERENDER_REVALIDATE_HEADER] = 'test-preview-id'

    const result = checkIsOnDemandRevalidate(headers, previewProps)
    expect(result).toEqual({
      isOnDemandRevalidate: true,
      revalidateOnlyGenerated: false,
    })
  })
})
