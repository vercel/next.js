export * from './client-exports'

// TODO: add exports all test case in pages
/**

import * as all from '../components/client-exports-all'
import * as allClient from '../components/client-exports-all.client'

export default function Page() {
  const { a, b, c, d, e } = all
  const { a: ac, b: bc, c: cc, d: dc, e: ec } = allClient
  return (
    <div>
      <div id='server'>{a}{b}{c}{d}{e[0]}</div>
      <div id='client'>{ac}{bc}{cc}{dc}{ec[0]}</div>
    </div>
  )
}

*/
