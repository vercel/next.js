export const unstable_instant = {
  level: 'experimental-error',
  // `usePathname` will error if we don't have a sample for `[id]`.
  unstable_samples: [{ params: { id: '123' } }],
}

export default function Page() {
  return (
    <main>
      <p>This page is static, so it should pass instant validation</p>
    </main>
  )
}
