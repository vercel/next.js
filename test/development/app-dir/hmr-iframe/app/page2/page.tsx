import { subscribeToHMR } from '../page1/subscribeToHMR'

export default async function Page2() {
  await subscribeToHMR()

  return (
    <html>
      <body>
        <p>content</p>
      </body>
    </html>
  )
}
