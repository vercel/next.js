export const unstable_instant = {
  prefetch: 'static',
  // `usePathname` will error if we don't have a sample for `[id]`.
  samples: [{ params: { id: '123' } }],
}

export default function Page() {
  return (
    <main>
      <p>This page is static, so it should pass instant validation</p>
    </main>
  )
}
