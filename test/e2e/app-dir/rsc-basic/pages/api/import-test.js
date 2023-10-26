// You can still import React and Next's client component APIs from the server
// they won't be poisoned by the environment.
// eslint-disable-next-line no-unused-vars
import { useState } from 'react'
import 'next/headers'

export default function (_, res) {
  res.end('Hello from import-test.js')
}
