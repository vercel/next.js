'use client'

let result = ''

for (let i = 0; i < 2 ** 26; i++) {
  await Promise.resolve()
}

result = 'done'

export default function Page() {
  return <p>{result}</p>
}
