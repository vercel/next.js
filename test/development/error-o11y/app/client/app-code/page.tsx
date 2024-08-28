'use client'

if ('window' in global) {
  throw Error('runtime error in client component app code')
}

export default function Page() {
  return <p>hello world</p>
}
