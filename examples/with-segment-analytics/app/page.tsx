import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Home',
}

export default function Home() {
  return (
    <div>
      <h1>This is the Home page</h1>
    </div>
  )
}
