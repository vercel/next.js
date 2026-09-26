export default async function Page() {
  let instrumented = 'no'
  try {
    const res = await fetch('http://fake.url/instrumentation-probe')
    const text = await res.text()
    if (text === 'instrumentation-active') {
      instrumented = 'yes'
    }
  } catch {
    instrumented = 'no'
  }

  return (
    <>
      <div id="update">touch to trigger HMR</div>
      <div id="instrumented">{instrumented}</div>
    </>
  )
}
