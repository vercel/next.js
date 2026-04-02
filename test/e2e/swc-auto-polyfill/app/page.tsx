'use client'

export default function Page() {
  // Array.prototype.at() requires polyfill for older browsers
  const items = [1, 2, 3]
  const last = items.at(-1)

  return <p id="result">last: {last}</p>
}
