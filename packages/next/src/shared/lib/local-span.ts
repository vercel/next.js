// Internal, synchronous local recording. No SDK, request context, feature gate,
// clock conversion or destination error policy belongs in this module.
export type LocalSpanSubscriber<Record> = (records: readonly Record[]) => void

// Observations received already completed (e.g. worker/browser batches) use the
// same delivery path without allocating artificial live spans or changing order.
export function emitLocalSpans<Record>(
  records: readonly Record[],
  subscriber: LocalSpanSubscriber<Record> | undefined
): void {
  subscriber?.(records)
}

// Facades retain their native clocks and completion schemas: converting tooling
// bigint nanoseconds/raw tags to request milliseconds/API attributes is lossy.
export abstract class LocalSpan<
  Attributes extends Record<string, unknown>,
  StartTime,
  EndTime,
  Completion,
> {
  protected ended = false

  constructor(
    protected name: string,
    protected attributes: Attributes,
    protected readonly startTime: StartTime,
    protected subscriber: LocalSpanSubscriber<Completion> | undefined
  ) {}

  protected setLocalAttribute(key: string, value: Attributes[string]): void {
    this.attributes[key as keyof Attributes] = value
  }

  protected finish(endTime: EndTime): void {
    if (this.ended) return
    // Set before any destination/delegate call: reentrancy and throwing
    // subscribers must not report a second completion.
    this.ended = true
    try {
      this.onEnd(endTime)
    } finally {
      this.releaseReferences()
    }
  }

  protected emit(record: Completion): void {
    emitLocalSpans([record], this.subscriber)
  }

  // The facade defines timing/schema conversion and delegate ordering, not the
  // shared recorder. In particular, request delegates end before local emission;
  // tooling's deferred terminal metadata must survive a throwing local writer.
  protected abstract onEnd(endTime: EndTime): void

  protected releaseReferences(): void {}
}
