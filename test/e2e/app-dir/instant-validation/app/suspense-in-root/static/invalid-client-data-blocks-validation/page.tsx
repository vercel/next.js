export const unstable_instant = {
  prefetch: 'static',
}

export default function Page() {
  return (
    <main>
      <p>
        This page is static, so it should pass instant validation, but client
        data fetching above will prevent us from validating it.
      </p>
    </main>
  )
}
