import Client from '../client'

const bytes = new Uint8Array(300)
for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 256

export default function Page() {
  return (
    <main>
      <h1>binary</h1>
      <Client label="binary" blob={bytes} />
    </main>
  )
}
