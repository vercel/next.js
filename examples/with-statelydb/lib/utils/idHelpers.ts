/**
 * Utility functions for converting between Uint8Array IDs and URL-safe strings
 */

/**
 * Convert a Uint8Array (UUID bytes) to a hex string for use in URLs
 */
export function idToString(id: Uint8Array): string {
  return Array.from(id)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert a hex string back to a Uint8Array
 */
export function stringToId(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(str.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Convert a bigint timestamp (seconds) to an ISO date string
 */
export function timestampToDate(timestamp: bigint): string {
  return new Date(Number(timestamp) * 1000).toISOString();
}

/**
 * Convert an ISO date string to a bigint timestamp (seconds)
 */
export function dateToTimestamp(date: string): bigint {
  return BigInt(Math.floor(new Date(date).getTime() / 1000));
}
