'use client'

export default function Page() {
  // Same code as the enabled fixture, but without swcEnvOptions
  const text = 'a-b-c'
  const result = text.replaceAll('-', '_')

  return <p id="result">{result}</p>
}
