'use client'

import { message } from './slow-module'

export function Client() {
  return <p id="content">{message}</p>
}
