import { Instant } from 'next'

export const instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [{ searchParams: { foo: 'fooValue', bar: 'barValue' } }],
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>
}) {
  await searchParams.then((sp) => sp.foo) // 1 (correct)
  await searchParams.then((sp) => sp.bar) // 2 (incorrect)

  return (
    <main>
      <p>
        This page awaits a couple blocking (runtime) things in sequence. We
        should point to the first one as the cause.
      </p>
    </main>
  )
}
