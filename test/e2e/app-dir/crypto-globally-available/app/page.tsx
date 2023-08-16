export default function Page() {
  return (
    <p>
      {typeof globalThis.crypto === 'object'
        ? 'crypto is available'
        : 'crypto is not available'}
    </p>
  )
}

export const runtime = 'nodejs'
