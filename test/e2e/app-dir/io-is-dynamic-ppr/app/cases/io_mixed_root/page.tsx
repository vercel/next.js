import { unstable_cache as cache } from 'next/cache'

export default async function Page() {
  await 1
  return (
    <>
      <p>
        This page calls `unstable_cache()` to fetch a pair of messages in
        parallel but in one of the messages some uncached IO is read which
        should deopt the whole page to dynamic
      </p>
      <ComponentOne />
      <ComponentTwo />
      <div id="page">{process.env.__TEST_SENTINEL}</div>
    </>
  )
}

async function ComponentOne() {
  return <div>message 1: {await getCachedMessage('hello cached fast', 2)}</div>
}

async function ComponentTwo() {
  return (
    <>
      <div>message 2: {await getMessage('hello uncached fast', 0)}</div>
      <div>message 3: {await getCachedMessage('hello cached slow', 20)}</div>
    </>
  )
}

async function getMessage(echo, delay) {
  await new Promise((r) => setTimeout(r, delay))
  return echo
}

const getCachedMessage = cache(getMessage)
