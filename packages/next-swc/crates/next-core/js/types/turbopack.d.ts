import type { RenderOptsPartial } from 'next/dist/server/render'

export type RenderData = {
  params: Record<string, string | string[]>
  method: string
  url: string
  path: string
  rawQuery: string
  rawHeaders: Array<[string, string]>
  data?: {
    nextConfigOutput?: RenderOptsPartial['nextConfigOutput']
  }
}
