/**
 * Create a "Thenable" that does not resolve. This is used to suspend indefinitely when data is not available yet.
 */
export const unresolvedThenable = {
  then: () => {},
}
