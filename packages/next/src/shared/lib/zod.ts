import type { ZodError } from 'next/dist/compiled/zod'

import { fromZodError } from 'next/dist/compiled/zod-validation-error'
import * as Log from '../../build/output/log'

export function formatZodError(prefix: string, error: ZodError) {
  return new Error(fromZodError(error, { prefix: prefix }).toString())
}

export function reportZodError(prefix: string, error: ZodError) {
  Log.error(formatZodError(prefix, error).message)
}
