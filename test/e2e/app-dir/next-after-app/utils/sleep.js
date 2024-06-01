/** @returns {Promise<void>} */
export function sleep(/** @type {number} */ duration) {
  return new Promise((resolve) => setTimeout(resolve, duration))
}
