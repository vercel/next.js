import { trace, Span } from './trace'
import { debugLog } from './shared'

const stacks = new WeakMap<any, Array<Span>>()
const stoppedSpansSets = new WeakMap<any, Set<Span>>()

export function stackPush(keyObj: any, spanName: string, attrs?: any): Span {
  let stack = stacks.get(keyObj)
  let span

  if (!stack) {
    stack = []
    stacks.set(keyObj, stack)
    span = trace(spanName, undefined, attrs ? attrs() : undefined)
  } else {
    const parent = stack[stack.length - 1]
    if (parent) {
      span = trace(spanName, parent.id, attrs ? attrs() : undefined)
    } else {
      span = trace(spanName, undefined, attrs ? attrs() : undefined)
    }
  }

  stack.push(span)
  return span
}

export function stackPop(keyObj: any, span: any): void {
  let stack = stacks.get(keyObj)
  if (!stack) {
    debugLog(
      'Attempted to pop from non-existent stack. Key reference must be bad.'
    )
    return
  }

  let stoppedSpans = stoppedSpansSets.get(keyObj)
  if (!stoppedSpans) {
    stoppedSpans = new Set()
    stoppedSpansSets.set(keyObj, stoppedSpans)
  }
  if (stoppedSpans.has(span)) {
    debugLog(
      `Attempted to terminate tracing span that was already stopped for ${span.name}`
    )
    return
  }

  while (true) {
    let poppedSpan = stack.pop()

    if (poppedSpan && poppedSpan === span) {
      stoppedSpans.add(poppedSpan)
      span.stop()
      stoppedSpans.add(span)
      break
    } else if (poppedSpan === undefined || stack.indexOf(span) === -1) {
      // We've either reached the top of the stack or the stack doesn't contain
      // the span for another reason.
      debugLog(`Tracing span was not found in stack for: ${span.name}`)
      stoppedSpans.add(span)
      span.stop()
      break
    } else if (stack.indexOf(span) !== -1) {
      debugLog(
        `Attempted to pop span that was not at top of stack for: ${span.name}`
      )
      stoppedSpans.add(poppedSpan)
      poppedSpan.stop()
    }
  }
}
