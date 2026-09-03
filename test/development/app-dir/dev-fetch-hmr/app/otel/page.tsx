export default async function OtelPage() {
  const res = await fetch('http://fake.url/otel-check')
  const text = await res.text()

  return (
    <div>
      <p id="result">{text}</p>
      <p id="update">touch to trigger HMR</p>
    </div>
  )
}
