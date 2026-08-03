import { edgeValue } from './edge-value'

export const config = { runtime: 'experimental-edge' }

export default function Edge() {
  return (
    <>
      <p id="edge-value">{edgeValue}</p>
      <a id="to-about" href="/about">
        About
      </a>
    </>
  )
}
