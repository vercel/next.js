'use client'
if (typeof window !== 'undefined') {
  import('my-differentiated-files/browser').then((mod) => {
    console.log({ TEST: mod.default })
  })
}

export default function Page() {
  return <h1>Page loaded</h1>
}
