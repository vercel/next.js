// @ts-expect-error createServerContext exists on experimental channel
import { createServerContext } from 'react'

export const HeadersContext = createServerContext('HeadersContext', null)
export const PreviewDataContext = createServerContext(
  'PreviewDataContext',
  null
)
export const CookiesContext = createServerContext('CookiesContext', null)
