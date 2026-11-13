'use client'

export function Client({ iterable }: { iterable: AsyncIterable<string> }) {
  return <p id="client">{typeof iterable}</p>
}
