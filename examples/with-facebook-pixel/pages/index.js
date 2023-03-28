import Link from 'next/link'
import * as fbq from '../lib/fpixel'

export default function Home() {
  const handleClick = () => {
    fbq.event('Purchase', { currency: 'USD', value: 10 })
  }

  return (
    <div>
      <h1>
        Go to `pages/_app.js` to see how you can add Facebook Pixel to your app
      </h1>
      <p>Click the button below to send a purchase event to Pixel</p>
      <button type="button" onClick={handleClick}>
        Buy $10
      </button>
      <p>
        Click the link below to navigate to another page.
        <br />
        <Link href="/navigation">Navigation page</Link>
      </p>
    </div>
  )
}
