import { stableValue } from './stable-value'

export default function Stable() {
  return (
    <>
      <p id="stable-value">{stableValue}</p>
      <a id="to-about" href="/about">
        About
      </a>
    </>
  )
}
