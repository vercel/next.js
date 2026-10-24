import value from './input.loader'
import { loadExternalValue } from './external-resource'

export default async function Page() {
  const externalValue = await loadExternalValue()
  return (
    <>
      <p id="loader-value">{value}</p>
      <p id="external-loader-value">{externalValue}</p>
    </>
  )
}
