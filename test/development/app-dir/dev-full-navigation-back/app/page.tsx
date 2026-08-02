import { value } from './value'

export default function Page() {
  return (
    <>
      <p id="value">{value}</p>
      <a id="to-about" href="/about">
        About
      </a>
    </>
  )
}
