import type { RenderOptsPartial as AppRenderOptsPartial } from '../server/app-render/types'
import type { RenderOptsPartial as PagesRenderOptsPartial } from '../server/render'
import type { LoadComponentsReturnType } from '../server/load-components'
import type { OutgoingHttpHeaders } from 'http'
import type AmpHtmlValidator from 'next/dist/compiled/amphtml-validator'

export interface AmpValidation {
  page: string
  result: {
    errors: AmpHtmlValidator.ValidationError[]
    warnings: AmpHtmlValidator.ValidationError[]
  }
}

export interface ExportPageResult {
  ampValidations?: AmpValidation[]
  fromBuildExportRevalidate?: number | false
  fromBuildExportMeta?: {
    status?: number
    headers?: OutgoingHttpHeaders
  }
  error?: boolean
  ssgNotFound?: boolean
}

export type WorkerRenderOptsPartial = PagesRenderOptsPartial &
  AppRenderOptsPartial

export type WorkerRenderOpts = WorkerRenderOptsPartial &
  LoadComponentsReturnType
