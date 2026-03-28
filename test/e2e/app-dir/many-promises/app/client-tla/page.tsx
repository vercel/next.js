'use client'

let result = ''

const p = Promise.resolve()
for (let chunk = 0; chunk < 2 ** 8; chunk++) {
  await new Promise((resolve) => setImmediate(resolve))
  for (let i = 0; i < 2 ** 16; i++) {
    await p
  }
}

result = 'done'

export default function Page() {
  return <p>{result}</p>
}
