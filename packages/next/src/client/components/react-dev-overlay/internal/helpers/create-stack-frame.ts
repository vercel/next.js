import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'

export function createStackFrame(searchParams: URLSearchParams) {
  return {
    file: searchParams.get('file') as string,
    methodName: searchParams.get('methodName') as string,
    lineNumber: parseInt(searchParams.get('lineNumber') ?? '0', 10) || 0,
    column: parseInt(searchParams.get('column') ?? '0', 10) || 0,
    arguments: searchParams.getAll('arguments').filter(Boolean),
  } satisfies StackFrame
}
