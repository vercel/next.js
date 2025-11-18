import { subscribeToHMR } from '../page1/subscribeToHMR'

export default async function Page() {
  await subscribeToHMR()

  return (
    <html>
      <body>
        <p>content</p>
      </body>
    </html>
  )
}
