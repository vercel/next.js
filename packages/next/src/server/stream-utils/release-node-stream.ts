import type { Duplex } from 'node:stream'

type OptionCallbacks = {
  _transform?: unknown
  _flush?: unknown
}

function noop(): void {}

function release(this: Duplex): void {
  // The listeners of the `close` event that is being emitted still run:
  // `emit` works on a copy of the list.
  this.removeAllListeners()
  // A closed stream emits nothing more. Should anything emit `error` on it
  // anyway, that must not become an uncaught exception.
  this.on('error', noop)

  // `new Transform({ transform, flush })` stores the two callbacks on the
  // instance. They are closures over the render.
  const callbacks = this as OptionCallbacks
  if (Object.prototype.hasOwnProperty.call(callbacks, '_transform')) {
    callbacks._transform = undefined
  }
  if (Object.prototype.hasOwnProperty.call(callbacks, '_flush')) {
    callbacks._flush = undefined
  }
}

/**
 * Makes a `Transform` or `PassThrough` that a render creates let go of that
 * render once the stream has closed, by removing its listeners and the
 * callbacks it was constructed with.
 *
 * Since Node.js 24.16 the stream itself is not freed by a young-generation GC
 * after it has closed: `WritableState` creates its `onwrite` callback as
 * `this.onwrite = (er) => onwrite(stream, er)`, V8 allocates a function
 * literal that is assigned to a property in the old generation, and that
 * closure references the stream. Until the next major GC the closed stream
 * is therefore treated as alive by every young-generation GC, together with
 * whatever it still references: its listeners (React leaves three on the
 * stream a render is piped to, each referencing the render's request), its
 * `transform` and `flush` callbacks, and through those most of what the
 * render allocated. With nothing left to reference, only the stream object
 * itself waits for the major GC.
 */
export function releaseOnClose<T extends Duplex>(stream: T): T {
  stream.once('close', release)
  return stream
}
