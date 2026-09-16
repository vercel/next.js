import { readFulfilledValue } from './rsc-transport'

export type LedgerValue<Entry, Total> = AsyncIterable<Entry> | Promise<Total>
export type SetLedgerValue<T> = LedgerValue<T, Set<T>>
export type MinLedgerValue = LedgerValue<number, number | undefined>

// Buffered responses may be truncated at a stage boundary. Read only the
// entries in that response; pending/rejected values are handled by the caller.

export function readSetLedger<T>(value: SetLedgerValue<T>): Set<T> | null {
  if (process.env.__NEXT_LEDGERS) {
    return readFulfilledValue(value as Promise<Set<T>>, null)
  }
  const total = new Set<T>()
  const iterator = (value as AsyncIterable<T>)[Symbol.asyncIterator]()
  while (true) {
    const step = readFulfilledValue(iterator.next(), undefined)
    if (step === undefined || step.done) {
      return total
    }
    total.add(step.value)
  }
}

export function readMinLedger<Fallback>(
  value: MinLedgerValue,
  unresolved: Fallback
): number | undefined | Fallback {
  if (process.env.__NEXT_LEDGERS) {
    return readFulfilledValue(value as Promise<number | undefined>, unresolved)
  }
  const iterator = (value as AsyncIterable<number>)[Symbol.asyncIterator]()
  let total: number | undefined
  while (true) {
    const step = readFulfilledValue(iterator.next(), undefined)
    if (step === undefined) {
      return total === undefined ? unresolved : total
    }
    if (step.done) {
      return total
    }
    total = step.value
  }
}
