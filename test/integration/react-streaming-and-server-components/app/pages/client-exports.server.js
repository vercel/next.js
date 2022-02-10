import { a, b, c, d, e } from '../components/client-exports'
import DefaultArrow from '../components/client-default-export-arrow.client'

export default function Page() {
  return (
    <div>
      <div id="named-exports">
        {a}
        {b}
        {c}
        {d}
        {e[0]}
      </div>
      <div id="default-exports-arrow">
        <DefaultArrow />
      </div>
    </div>
  )
}
