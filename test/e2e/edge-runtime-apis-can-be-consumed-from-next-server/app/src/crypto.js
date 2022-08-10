import { crypto } from 'next/server'
import { getQuery } from './get-query'

export async function cryptoTest(req) {
  const { input } = getQuery(['input'], req)
  return { input, hash: await sha256digest(input) }
}

/**
 * @param {string} string
 * @returns {Promise<string>}
 */
async function sha256digest(string) {
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(string)
  )
  return toHex(hashBuffer)
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function toHex(buffer) {
  const bytes = Array.from(new Uint8Array(buffer))
  return bytes.map((x) => x.toString(16).padStart(2, '0')).join('')
}
