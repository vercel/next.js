/**
 * Callback function for sorting font variant values.
 * Used as a parameter in `Array.prototype.sort` function to ensure correct sorting.
 */

export function sortFontsVariantValues(valA: string, valB: string) {
  // If both values contain commas, it indicates they are in "ital,wght" format
  if (valA.includes(',') && valB.includes(',')) {
    // Split the values into prefix and suffix
    const [aPrefix, aSuffix] = valA.split(',', 2)
    const [bPrefix, bSuffix] = valB.split(',', 2)

    // Compare the prefixes (ital values)
    if (aPrefix === bPrefix) {
      // If prefixes are equal, then compare the suffixes (wght values)
      return parseInt(aSuffix) - parseInt(bSuffix)
    } else {
      // If prefixes are different, then compare the prefixes directly
      return parseInt(aPrefix) - parseInt(bPrefix)
    }
  }

  // If values are not in "ital,wght" format, then directly compare them as integers
  return parseInt(valA) - parseInt(valB)
}
