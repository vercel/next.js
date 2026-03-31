/**
 * Formats an array of values into a string that can be used error messages.
 * ["a", "b", "c"] => "`a`, `b`, `c`"
 */
export const formatAvailableValues = (values: string[]) =>
  values.map((val) => `\`${val}\``).join(', ')
