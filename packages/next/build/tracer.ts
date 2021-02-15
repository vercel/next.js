import api, { Span } from '@opentelemetry/api'

export const tracer = api.trace.getTracer('next', process.env.__NEXT_VERSION)

const compilerStacks = new WeakMap()
const compilerStoppedSpans = new WeakMap()

export function stackPush(compiler: any, spanName: string, attrs?: any): any {
  let stack = compilerStacks.get(compiler)
  let span

  if (!stack) {
    compilerStacks.set(compiler, (stack = []))
    span = tracer.startSpan(spanName, attrs ? attrs() : undefined)
  } else {
    const parent = stack[stack.length - 1]
    if (parent) {
      tracer.withSpan(parent, () => {
        span = tracer.startSpan(spanName, attrs ? attrs() : undefined)
      })
    } else {
      span = tracer.startSpan(spanName, attrs ? attrs() : undefined)
    }
  }

  stack.push(span)
  return span
}

export function stackPop(compiler: any, span: any, associatedName?: string) {
  let stack = compilerStacks.get(compiler)
  if (!stack) {
    console.warn(
      'Attempted to pop from non-existent stack. Compiler reference must be bad.'
    )
    return
  }

  let stoppedSpans: Set<Span> = compilerStoppedSpans.get(compiler)
  if (!stoppedSpans) {
    stoppedSpans = new Set()
    compilerStoppedSpans.set(compiler, stoppedSpans)
  }
  if (stoppedSpans.has(span)) {
    console.warn(
      `Attempted to terminate tracing span that was already stopped for ${associatedName}`
    )
    return
  }

  while (true) {
    let poppedSpan = stack.pop()

    if (poppedSpan === span) {
      stoppedSpans.add(poppedSpan)
      span.end()
      stoppedSpans.add(span)
      break
    } else if (poppedSpan === undefined || stack.indexOf(span) === -1) {
      // We've either reached the top of the stack or the stack doesn't contain
      // the span for another reason.
      console.warn(`Tracing span was not found in stack for: ${associatedName}`)
      stoppedSpans.add(span)
      span.end()
      break
    } else if (stack.indexOf(span) !== -1) {
      console.warn(
        `Attempted to pop span that was not at top of stack for: ${associatedName}`
      )
      stoppedSpans.add(poppedSpan)
      poppedSpan.end()
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
