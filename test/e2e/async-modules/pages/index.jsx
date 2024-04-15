const value = await Promise.resolve(42)

export default function Index({ appValue }) {
  return (
    <main>
      <div id="app-value">{appValue}</div>
      <div id="page-value">{value}</div>
    </main>
  )
}
