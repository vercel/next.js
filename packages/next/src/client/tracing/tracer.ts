import { LogSpanAllowList } from '../../server/lib/trace/constants'
import mitt from '../../shared/lib/mitt'
import type { MittEmitter } from '../../shared/lib/mitt'

export type SpanOptions = {
  startTime?: number
  attributes?: Record<string, unknown>
}

export type SpanState =
  | {
      state: 'inprogress'
    }
  | {
      state: 'ended'
      endTime: number
    }

interface ISpan {
  name: string
  startTime: number
  attributes: Record<string, unknown>
  state: SpanState
  end(endTime?: number): void
}

class Span implements ISpan {
  name: string
  startTime: number
  onSpanEnd: (span: Span) => void
  state: SpanState
  attributes: Record<string, unknown>

  constructor(
    name: string,
    options: SpanOptions,
    onSpanEnd: (span: Span) => void
  ) {
    this.name = name
    this.attributes = options.attributes ?? {}
    this.startTime = options.startTime ?? Date.now()
    this.onSpanEnd = onSpanEnd
    this.state = { state: 'inprogress' }
  }

  end(endTime?: number) {
    if (this.state.state === 'ended') {
      throw new Error('Span has already ended')
    }

    this.state = {
      state: 'ended',
      endTime: endTime ?? Date.now(),
    }

    if (
      process.env.NEXT_OTEL_PERFORMANCE_PREFIX &&
      LogSpanAllowList.includes(this.name || ('' as any))
    ) {
      const { timeOrigin } = performance
      performance.measure(
        `${process.env.NEXT_OTEL_LOG_PREFIX}:next-${(
          this.name.split('.').pop() || ''
        ).replace(/[A-Z]/g, (match: string) => '-' + match.toLowerCase())}`,
        {
          start: this.startTime - timeOrigin,
          end: this.state.endTime - timeOrigin,
        }
      )
    }

    this.onSpanEnd(this)
  }
}

class Tracer {
  _emitter: MittEmitter<string> = mitt()

  private handleSpanEnd = (span: Span) => {
    this._emitter.emit('spanend', span)
  }

  startSpan(name: string, options: SpanOptions) {
    return new Span(name, options, this.handleSpanEnd)
  }

  onSpanEnd(cb: (span: ISpan) => void): () => void {
    this._emitter.on('spanend', cb)
    return () => {
      this._emitter.off('spanend', cb)
    }
  }
}

export type { ISpan as Span }
export default new Tracer()
