import { connection } from 'next/server'

export default async function DestinationPage() {
  await connection()
  return <div id="destination-content">Destination page content</div>
}
