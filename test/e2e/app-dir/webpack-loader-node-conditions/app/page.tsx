import value from './value.condition-test'

export default function Page() {
  return (
    <>
      <p id="conditions">{value}</p>
      <p id="node-selected">{process.env.SELECTED_LOADER_VALUE}</p>
    </>
  )
}
