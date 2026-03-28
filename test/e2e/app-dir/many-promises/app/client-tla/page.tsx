'use client'

let result = ''

const p = Promise.resolve()
for (let i = 0; i < 2 ** 26; i++) {
  await p
}

result = 'done'

export default function Page() {
  return <p>{result}</p>
}
