export const unstable_instant = { level: 'experimental-error' }

export default function Page() {
  return (
    <main>
      <p>This page is static, so it should pass instant validation</p>
    </main>
  )
}
