'use client'

const p = Promise.resolve()

if (typeof window !== 'undefined') {
  console.log('promises start')
  for (let chunk = 0; chunk < 2 ** 4; chunk++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    for (let i = 0; i < 2 ** 16; i++) {
      await p
    }
  }
  console.log('promises end')
}

// Always 'done' on both SSR and client to avoid hydration mismatch
const result = 'done'

export default function Page() {
  return <p>{result}</p>
}
