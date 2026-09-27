import { unstable_prefetch } from 'next/cache'
import { Suspense } from 'react'

/**
 * Only renders `text` when requested with a prefetch (i.e. it's excluded from the app shell)
 *
 * Exists mostly because of `createRouterAct`'s requirement
 * that the text in the `includes` assertion is unique:
 *
 * ```
 * The same expected substring was sent multiple times by the server
 * [...]
 * Choose a more specific substring to assert on.
 * ```
 * This component lets us concisely add a second string that will only
 * appear in the prefetch:
 *
 * ```tsx
 * <div>{`Foo: ${foo}`}</div>
 * <PrefetchContent text={`Foo (in prefetch): ${foo}`}} />
 * ```
 * Which lets us assert separately on `{ includes: "Foo: ..." }` and
 * `{ includes: "Foo (in prefetch): ..." }`
 * */
export function PrefetchContent({ text }: { text: string }) {
  return (
    <Suspense
      fallback={
        <div id="prefetch-content-fallback">Not included in the shell</div>
      }
    >
      <Inner text={text} />
    </Suspense>
  )
}

async function Inner({ text }: { text: string }) {
  await unstable_prefetch()
  return <div id="prefetch-content">{text}</div>
}
