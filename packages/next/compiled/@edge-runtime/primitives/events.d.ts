import type { EventTarget } from 'event-target-shim'

declare const EventTargetConstructor: typeof EventTarget
declare const EventConstructor: typeof Event

export { EventConstructor as Event }

export class FetchEvent {
  awaiting: Set<Promise<void>>
  constructor(request: Request)
}

export { EventTargetConstructor as EventTarget }
export { EventTarget as PromiseRejectionEvent } from 'event-target-shim'
