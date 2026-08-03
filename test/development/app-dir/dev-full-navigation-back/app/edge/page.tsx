import { edgeValue } from '../edge-value'

export const runtime = 'edge'

export default function Page() {
  return (
    <>
      <p id="edge-value">{edgeValue}</p>
      <a id="to-about" href="/about">
        About
      </a>
    </>
  )
}
