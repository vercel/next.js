import { unstable_cache as cache } from 'next/cache'

export default async function Page() {
  await 1
  return (
    <>
      <p>
        This page calls `unstable_cache()` to fetch a pair of messages in
        serial. Each one blocks in a setTimeout. Even though these are IO we
        still expect the result to be part of the prerender as long as there is
        nothing else dynamic in the render.
      </p>
      <div>message 1: {await getMessage('hello cached fast', 2)}</div>
      <div>message 2: {await getMessage('hello cached slow', 20)}</div>
      <div id="page">{process.env.__TEST_SENTINEL}</div>
    </>
  )
}

const getMessage = cache(async (echo, delay) => {
  await new Promise((r) => setTimeout(r, delay))
  return echo
})
