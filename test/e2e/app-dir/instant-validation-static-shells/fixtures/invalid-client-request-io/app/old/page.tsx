import { SearchParamsClient } from './client'

export default async function Page() {
  return (
    <main>
      <p>
        This is a blocking page with request IO in client component. It is NOT
        configured with Instant config. It will error during the legacy Static
        Shell Validation on both dev and build.
      </p>
      <SearchParamsClient />
    </main>
  )
}
