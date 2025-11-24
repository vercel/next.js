/**
 * This function accounts for the overhead of encoding the data to be sent
 * over the network via a multipart request.
 *
 * @param {number} megaBytes
 * @returns {number}
 */
export function accountForOverhead(megaBytes) {
  // We are sending {megaBytes} - 5% to account for encoding overhead
  return Math.floor(1024 * 1024 * megaBytes * 0.95)
}
