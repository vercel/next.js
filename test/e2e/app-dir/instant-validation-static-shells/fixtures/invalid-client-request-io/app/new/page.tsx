import { SearchParamsClient } from './client'

export default async function Page() {
  return (
    <main>
      <p>
        This is a blocking page with request IO in client component. It is
        configured with{' '}
        <code>{`unstable_instant = { prefetch: 'static' }`}</code>. It will
        error during the Static Shell Validation, but will not error during the
        Instant Validation because usePathname() does not suspened during client
        navigation.
      </p>
      <SearchParamsClient />
    </main>
  )
}

export const unstable_instant = {
  prefetch: 'static',
}
