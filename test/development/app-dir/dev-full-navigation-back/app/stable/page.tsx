import { stableValue } from '../stable-value'

export default function Page() {
  return (
    <>
      <p id="stable-value">{stableValue}</p>
      <a id="to-about" href="/about">
        About
      </a>
    </>
  )
}
