import { StackFrame } from '@vercel/turbopack-next/compiled/stacktrace-parser'

export type OriginalStackFrameResponse = {
  originalStackFrame: StackFrame
  originalCodeFrame: string | null
}
