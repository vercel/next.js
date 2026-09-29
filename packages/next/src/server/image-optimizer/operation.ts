import { getImageBlurSvg } from '../../shared/lib/image-blur-svg'
import { getImageSize } from './get-image-size'
import {
  imageOptimizerTransform,
  type ImageOptimizerResult,
  type ImageOptimizerTransformConfig,
  type ImageOptimizerTransformParams,
  type ImageUpstream,
} from './transform'

export const BLUR_IMG_SIZE = 8
export const BLUR_QUALITY = 70

export type ImageOptimizerDiagnostic =
  | { level: 'error'; args: string[] }
  | { level: 'warn-once'; message: string }

export interface ImageOptimizerOperation {
  imageUpstream: ImageUpstream
  params: ImageOptimizerTransformParams
  config: ImageOptimizerTransformConfig
  options: {
    isDev?: boolean
    previousOutput?: {
      buffer: Buffer
      maxAge?: number
      etag: string
      upstreamEtag: string
    }
  }
}

export interface ImageOptimizerOperationResult {
  result: ImageOptimizerResult
  diagnostics: ImageOptimizerDiagnostic[]
}

async function makeBlurPlaceholder(buffer: Buffer, contentType: string) {
  const meta = await getImageSize(buffer)
  const blurOpts = {
    blurWidth: meta.width,
    blurHeight: meta.height,
    blurDataURL: `data:${contentType};base64,${buffer.toString('base64')}`,
  }
  return {
    buffer: Buffer.from(unescape(getImageBlurSvg(blurOpts))),
    contentType: 'image/svg+xml',
  }
}

function stringifyDiagnosticArg(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (value instanceof Error) {
    return value.message
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * The serializable image transformation boundary shared by the in-process and
 * sandboxed implementations. Fetching, caching, and response handling remain
 * in the parent server.
 */
export async function executeImageOptimizerOperation(
  operation: ImageOptimizerOperation
): Promise<ImageOptimizerOperationResult> {
  const diagnostics: ImageOptimizerDiagnostic[] = []
  const { imageUpstream, params, config, options } = operation

  const result = await imageOptimizerTransform(imageUpstream, params, config, {
    previousOutput: options.previousOutput,
    logger: {
      error(...args: unknown[]) {
        diagnostics.push({
          level: 'error',
          args: args.map(stringifyDiagnosticArg),
        })
      },
      warnOnce(message: string) {
        diagnostics.push({ level: 'warn-once', message })
      },
    },
    handleDevOutput:
      options.isDev &&
      params.width <= BLUR_IMG_SIZE &&
      params.quality === BLUR_QUALITY
        ? makeBlurPlaceholder
        : undefined,
  })

  return { result, diagnostics }
}
