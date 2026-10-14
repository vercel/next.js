// ../../lib/helper.js exercises the double-parent ("../../") prefix path
import { add } from '../../lib/helper.js'

export default function NestedPage() {
  return <p id="nested-sum">{add(10, 20)}</p>
}
