import { useEffect } from 'react'

export default function Home() {
  useEffect(() => {
    // Only run on client
    import('@turbo/pack-test-harness').then(runTests)
  })

  const pub = Object.fromEntries(
    Object.entries(process.env)
      .filter(([key]) => key.startsWith('NEXT_PUBLIC_'))
      .sort((a, b) => a[0].localeCompare(b[0]))
  )

  return JSON.stringify(pub)
}

function runTests() {
  it('test', function () {})
}
