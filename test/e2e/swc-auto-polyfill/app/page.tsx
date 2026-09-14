'use client'

export default function Page() {
  // String.prototype.replaceAll requires polyfill for Chrome < 85
  const text = 'a-b-c'
  const result = text.replaceAll('-', '_')

  return <p id="result">{result}</p>
}
