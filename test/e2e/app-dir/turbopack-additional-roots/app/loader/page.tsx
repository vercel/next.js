import value from './input.loader'
import linkedValue from '../../linked/value.loader'

export default function Page() {
  return (
    <>
      <p id="loader-value">{value}</p>
      <p id="linked-loader-value">{linkedValue}</p>
    </>
  )
}
