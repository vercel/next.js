import { NextParsedUrlQuery } from 'next/dist/server/request-meta'

export type RenderData = {
  params: Record<string, string | string[]>
  method: string
  url: string
  path: string
  rawQuery: string
  rawHeaders: Array<[string, string]>
}
