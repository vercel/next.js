'use client'

export default function Page() {
  console.error(new Error('page error'))
  return <p>ssr</p>
}
