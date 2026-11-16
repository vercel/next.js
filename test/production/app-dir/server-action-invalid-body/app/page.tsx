'use client'

import { doThing } from './actions'

export default function Page() {
  return <button onClick={() => doThing('x')}>go</button>
}
