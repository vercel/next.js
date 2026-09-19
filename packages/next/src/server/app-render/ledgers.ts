import * as React from 'react'
import { getServerReact } from '../runtime-reacts.external'

declare const builtInLedger: unique symbol

// Targets are the built-in identity or the userspace accumulator itself. Value
// describes the userspace transport; built-in values come from captureLedgers.
export type Ledger<Entry, Value> =
  | { readonly [builtInLedger]: { entry: Entry; value: Value } }
  | { add(entry: Entry): void; close(): void; readonly value: Value }

export type MinLedger = Ledger<number, AsyncIterable<number>>
export type SetLedger<T> = Ledger<T, AsyncIterable<T>>

const reactWithLedgers = React as unknown as {
  createSetLedger<T>(): SetLedger<T>
  createMinLedger(): MinLedger
  captureLedgers<T>(
    data: T,
    ledgers: readonly [SetLedger<string>, MinLedger]
  ): { data: T; ledgers: [Promise<Set<string>>, Promise<number | undefined>] }
}

// Only the RSC copy of this module creates built-in identities. Outside RSC,
// access them through ComponentMod so writes and captures use the same identity.
// The fallback identities are opaque to callers. This module ignores writes
// to them; userspace tracking uses the per-render accumulators created below.
export const VaryParamsLedger =
  process.env.__NEXT_LEDGERS &&
  typeof reactWithLedgers.createSetLedger === 'function'
    ? reactWithLedgers.createSetLedger<string>()
    : (null as unknown as SetLedger<string>)
export const StaleTimeLedger =
  process.env.__NEXT_LEDGERS &&
  typeof reactWithLedgers.createMinLedger === 'function'
    ? reactWithLedgers.createMinLedger()
    : (null as unknown as MinLedger)

export const captureLedgers = reactWithLedgers.captureLedgers

// Each render uses the shared built-in identity, or creates its own userspace
// accumulator when the flag is off.
export function createMinLedger(builtIn: MinLedger): MinLedger {
  return process.env.__NEXT_LEDGERS ? builtIn : new MinLedgerAccumulator()
}

export function createSetLedger<T>(builtIn: SetLedger<T>): SetLedger<T> {
  return process.env.__NEXT_LEDGERS ? builtIn : new SetLedgerAccumulator<T>()
}

export const addToLedger = (
  process.env.__NEXT_LEDGERS ? addToBuiltInLedger : addToUserspaceLedger
) as {
  <Entry, Value>(ledger: Ledger<Entry, Value>, entry: Entry): void
}

function addToBuiltInLedger<Entry, Value>(
  ledger: Ledger<Entry, Value>,
  entry: Entry
): void {
  const serverReact = (getServerReact() ?? React) as unknown as {
    addToLedger(ledger: Ledger<Entry, Value>, entry: Entry): void
  }
  serverReact.addToLedger(ledger, entry)
}

function addToUserspaceLedger<Entry, Value>(
  ledger: Ledger<Entry, Value>,
  entry: Entry
): void {
  if (ledger === null) {
    return
  }
  ;(ledger as { add(entry: Entry): void }).add(entry)
}

export function closeLedger(ledger: Ledger<unknown, unknown>): void {
  if (!process.env.__NEXT_LEDGERS && ledger !== null) {
    ;(ledger as { close(): void }).close()
  }
}

export function getLedgerValue<Entry, Value>(
  ledger: Ledger<Entry, Value> | null | undefined
): Value | undefined {
  return process.env.__NEXT_LEDGERS || ledger == null
    ? undefined
    : (ledger as { readonly value: Value }).value
}

// Flight consumes each userspace stream once. Values are queued immediately so
// a truncated response retains the contributions made before it was cut off.
class LedgerStream<T> implements AsyncIterable<T> {
  protected done = false
  private resolve: ((result: IteratorResult<T>) => void) | null = null
  private buffer: T[] = []

  get value(): this {
    return this
  }

  protected push(value: T): void {
    if (this.resolve !== null) {
      this.resolve({ value, done: false })
      this.resolve = null
    } else {
      this.buffer.push(value)
    }
  }

  close(): void {
    if (this.done) {
      return
    }
    this.done = true
    if (this.resolve !== null) {
      this.resolve({ value: undefined, done: true })
      this.resolve = null
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.buffer.length > 0) {
          return Promise.resolve({ value: this.buffer.shift()!, done: false })
        }
        if (this.done) {
          return Promise.resolve({ value: undefined, done: true })
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolve = resolve
        })
      },
    }
  }
}

class MinLedgerAccumulator extends LedgerStream<number> {
  private currentValue: number | undefined = undefined

  add(value: number): void {
    if (
      this.done ||
      (this.currentValue !== undefined && this.currentValue <= value)
    ) {
      return
    }
    this.currentValue = value
    this.push(value)
  }
}

class SetLedgerAccumulator<T> extends LedgerStream<T> {
  private seen = new Set<T>()

  add(value: T): void {
    if (this.done || this.seen.has(value)) {
      return
    }
    this.seen.add(value)
    this.push(value)
  }
}

// Safe to share: it can only yield "done", even with concurrent consumers.
export const emptySetLedger = new SetLedgerAccumulator<never>()
emptySetLedger.close()
