'use client'

export function Thrower({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('this is a test')
  }

  return <p id="recover">Recovered</p>
}
