'use server'

/**
 * @param {number[]} largeJson
 */
export async function submitLargePayload(largeJson) {
  return {
    success: true,
    count: largeJson.length,
    firstId: largeJson[0],
    lastId: largeJson[largeJson.length - 1],
  }
}
