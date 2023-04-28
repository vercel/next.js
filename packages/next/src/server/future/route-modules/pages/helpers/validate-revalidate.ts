/**
 * Validates the revalidate option from getStaticProps and returns the coerced
 * value as a number or false.
 *
 * @param revalidate the revalidate option from getStaticProps
 * @param url the url of the page for error messages
 * @returns the revalidate option as a number or false
 */
export function validateRevalidate(
  revalidate: number | boolean | undefined,
  url: string
): number | false {
  if (typeof revalidate === 'boolean' || typeof revalidate === 'undefined') {
    // When enabled, revalidate after 1 second. This value is optimal for
    // the most up-to-date page possible, but without a 1-to-1
    // request-refresh ratio.
    if (revalidate) {
      return 1
    }

    // By default, we never revalidate.
    return false
  }

  // If it's not a number, error out, this is likely a mistake.
  if (typeof revalidate !== 'number') {
    throw new Error(
      `A page's revalidate option must be seconds expressed as a natural number. Mixed numbers and strings cannot be used. Received '${JSON.stringify(
        revalidate
      )}' for ${url}`
    )
  }

  // If it's not an integer, error out, this is likely a mistake.
  if (!Number.isInteger(revalidate)) {
    throw new Error(
      `A page's revalidate option must be seconds expressed as a natural number for ${url}. Mixed numbers, such as '${revalidate}', cannot be used.` +
        `\nTry changing the value to '${Math.ceil(
          revalidate
        )}' or using \`Math.ceil()\` if you're computing the value.`
    )
  }

  // If it's less than or equal to zero, error out, this is likely a mistake.
  if (revalidate <= 0) {
    throw new Error(
      `A page's revalidate option can not be less than or equal to zero for ${url}. A revalidate option of zero means to revalidate after _every_ request, and implies stale data cannot be tolerated.` +
        `\n\nTo never revalidate, you can set revalidate to \`false\` (only ran once at build-time).` +
        `\nTo revalidate as soon as possible, you can set the value to \`1\`.`
    )
  }

  // If it's greater than a year, error out, this is likely a mistake.
  if (revalidate > 31536000) {
    console.warn(
      `Warning: A page's revalidate option was set to more than a year for ${url}. This may have been done in error.` +
        `\nTo only run getStaticProps at build-time and not revalidate at runtime, you can set \`revalidate\` to \`false\`!`
    )
  }

  return revalidate
}
