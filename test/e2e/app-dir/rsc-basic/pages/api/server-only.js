import 'server-only'

// You can still import React's client component APIs from the server - it won't
// be poisoned by the environment.
import { useState } from 'react'

export default function (_, res) {
  res.end('Hello from server-only.js')
}
