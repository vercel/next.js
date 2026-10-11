'use client'

import { serverMessage } from '../lib/server-message'

export default function InvalidClient() {
  return <button onClick={() => serverMessage()}>Invalid boundary</button>
}
