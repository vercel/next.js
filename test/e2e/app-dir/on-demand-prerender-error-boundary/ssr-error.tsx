'use client'

export function SsrError({
  value,
}: {
  value: 0 | false | '' | null | undefined
}) {
  if (typeof window === 'undefined') {
    throw value
  }

  return <p id="content">Recovered in browser</p>
}
