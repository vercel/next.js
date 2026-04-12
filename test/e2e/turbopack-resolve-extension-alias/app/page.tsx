// ../lib/* exercises the single-parent ("../") prefix path
import { Greeting } from '../lib/greeting.js'
import { add } from '../lib/helper.js'
import { PLAIN_VALUE } from '../lib/plain.js'
// ./same-dir-util.js exercises the same-directory ("./") prefix path
import { SAME_DIR } from './same-dir-util.js'

export default function Page() {
  return (
    <div>
      <Greeting />
      <p id="sum">{add(1, 2)}</p>
      <p id="plain">{PLAIN_VALUE}</p>
      <p id="same-dir">{SAME_DIR}</p>
    </div>
  )
}
