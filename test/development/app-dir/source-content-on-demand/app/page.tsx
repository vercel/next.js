'use client'

import { greeting } from '../lib/util'

export default function Page() {
  return <p id="msg">{greeting('world')}</p>
}
