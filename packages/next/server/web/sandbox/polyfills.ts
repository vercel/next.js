import { Crypto as WebCrypto } from 'next/dist/compiled/@peculiar/webcrypto'
import { CryptoKey } from 'next/dist/compiled/@peculiar/webcrypto'
import { v4 as uuid } from 'next/dist/compiled/uuid'
import processPolyfill from 'next/dist/compiled/process'

import crypto from 'crypto'

export function atob(b64Encoded: string) {
  return Buffer.from(b64Encoded, 'base64').toString('binary')
}

export function btoa(str: string) {
  return Buffer.from(str, 'binary').toString('base64')
}

export { CryptoKey, processPolyfill as process }

export class Crypto extends WebCrypto {
  // @ts-ignore Remove once types are updated and we deprecate node 12
  randomUUID = crypto.randomUUID || uuid
}
