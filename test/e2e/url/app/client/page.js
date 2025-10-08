'use client'

const url = new URL('../../public/vercel.png', import.meta.url).pathname

export default function Index(props) {
  return (
    <main>
      Hello {new URL('../../public/vercel.png', import.meta.url).pathname}+{url}
    </main>
  )
}
