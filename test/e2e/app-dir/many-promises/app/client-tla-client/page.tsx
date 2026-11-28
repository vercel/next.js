'use client'

const p = Promise.resolve()

let result = ''

if (typeof window !== 'undefined') {
  console.log('promises start')
  for (let chunk = 0; chunk < 2 ** 4; chunk++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    for (let i = 0; i < 2 ** 16; i++) {
      await p
    }
  }
  result = 'done'
  console.log('promises end')
}

export default function Page() {
  return <p suppressHydrationWarning>{result}</p>
}
