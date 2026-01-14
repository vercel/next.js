/**
 * Utilities for parsing and serializing Resume Data Cache during build.
 */

export type ResumeStoreSerialized = {
  store: {
    cache: { [key: string]: any }
    fetch: { [key: string]: any }
    encryptedBoundArgs: { [key: string]: string }
  }
}

/**
 * Parses a compressed serialized resume data cache string into a JSON object.
 * Used during build to collect and merge RDCs from multiple routes.
 */
export function parseSerializedResumeDataCache(
  serialized: string
): ResumeStoreSerialized | null {
  if (serialized === 'null' || !serialized) return null

  const { inflateSync } = require('node:zlib') as typeof import('node:zlib')
  return JSON.parse(
    inflateSync(Buffer.from(serialized, 'base64'), {
      maxOutputLength: 500 * 1024 * 1024, // 500MB limit for zip bomb protection
    }).toString('utf-8')
  )
}

/**
 * Compresses a ResumeStoreSerialized object into a base64 string.
 * Used during build after merging RDCs from multiple routes.
 */
export function stringifyParsedResumeDataCache(
  parsed: ResumeStoreSerialized
): string {
  const { deflateSync } = require('node:zlib') as typeof import('node:zlib')
  return deflateSync(JSON.stringify(parsed)).toString('base64')
}
