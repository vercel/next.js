import Client from './client'

export default function Page() {
  const rows = []
  for (let i = 0; i < 40; i++) {
    rows.push(
      <p key={i} className="row">
        row {i} with some copy to give the payload a bit of weight
      </p>
    )
  }
  return (
    <main>
      <h1>parity home</h1>
      {rows}
      <Client label="hello from client" />
    </main>
  )
}
