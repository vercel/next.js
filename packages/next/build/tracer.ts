import api, { Span } from '@opentelemetry/api'

export const tracer = api.trace.getTracer('next', process.env.__NEXT_VERSION)

const compilerStacks = new WeakMap()

export function stackPush(compiler: any, spanName: string, attrs?: any): any {
  let stack = compilerStacks.get(compiler)
  let span

  if (!stack) {
    compilerStacks.set(compiler, (stack = []))
    span = tracer.startSpan(spanName, attrs ? attrs() : undefined)
  } else {
    const parent = stack[stack.length - 1]
    tracer.withSpan(parent, () => {
      span = tracer.startSpan(spanName, attrs ? attrs() : undefined)
    })
  }

  stack.push(span)
  return span
}

export function stackPop(compiler: any, span: any) {
  span.end()

  let stack = compilerStacks.get(compiler)
  if (!stack) {
    console.warn(
      'Attempted to pop from non-existent stack. Compiler reference must be bad.'
    )
    return
  }
  const poppedSpan = stack.pop()
  if (poppedSpan !== span) {
    stack.push(poppedSpan)
    const spanIdx = stack.indexOf(span)
    console.warn('Attempted to pop span that was not at top of stack.')
    if (spanIdx !== -1) {
      console.info(
        `Span was found at index ${spanIdx} with stack size ${stack.length}`
      )
    }
  }
}

export function traceFn<T extends (...args: unknown[]) => ReturnType<T>>(
  span: Span,
  fn: T
): ReturnType<T> {
  return tracer.withSpan(span, () => {
    try {
      return fn()
    } finally {
      span.end()
    }
  })
}

export function traceAsyncFn<T extends (...args: unknown[]) => ReturnType<T>>(
  span: Span,
  fn: T
): Promise<ReturnType<T>> {
  return tracer.withSpan(span, async () => {
    try {
      return await fn()
    } finally {
      span.end()
    }
  })
}
