import { format, inspect } from '../../../compiled/next-test-primitives/browser'

export { inspect }
export function formatWithOptions(
  options: Parameters<typeof format>[1],
  ...values: unknown[]
) {
  return format(values, options)
}

// The compiler lowers async suite bodies to the same owned continuations.
export { createDeclarationStorage } from './async-context'
