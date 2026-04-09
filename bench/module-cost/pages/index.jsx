import { Client } from '../components/client.js'

export default function Home() {
  return (
    <>
      <h1>Measures the loading time of modules (pages router)</h1>
      <Client prefix="/api" />
    </>
  )
}
