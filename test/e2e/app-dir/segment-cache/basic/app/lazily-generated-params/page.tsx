import Link from 'next/link'

// TODO: Once the appropriate API exists/is implemented, configure the param to
// be statically generated on demand but not at build time (`dynamicParams =
// true` isn't supported when `dynamicIO` is enabled.) For now this test case
// seems to work without extra configuration but it might not in the future.

export default function LazilyGeneratedParamsStartPage() {
  return (
    <>
      <p>
        Demonstrates that we can prefetch param that is not generated at build
        time but is lazily generated on demand
      </p>
      <ul>
        <li>
          <Link href="/lazily-generated-params/some-param-value">Target</Link>
        </li>
      </ul>
    </>
  )
}
