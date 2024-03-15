'use client'

import test from './file.test-file.js'

export default function Client() {
  return <p>client: {JSON.stringify(test)}</p>
}
