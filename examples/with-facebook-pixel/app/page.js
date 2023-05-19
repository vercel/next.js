import Link from 'next/link'

export default function Home() {
  return (
    <>
      <h2>
        Go to `app/layout.js` to see how implement Facebook Pixel in NextJS ˆ13
        with app folder
      </h2>
      <h2>If you want to see old implementation, go to `_pages/index.js`</h2>
      <Link href="/about">About page</Link>
    </>
  )
}
