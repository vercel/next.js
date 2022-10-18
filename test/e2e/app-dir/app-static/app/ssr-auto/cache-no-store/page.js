import { cache, use } from '../../../lib/utils'

export default function Page() {
  const getData = () =>
    fetch('https://example.vercel.sh', {
      cache: 'no-store',
    })
      .then((res) => res.text())
      .then((text) => new Promise((res) => setTimeout(() => res(text), 1000)))
  const dataPromise = cache(getData)
  const data = use(dataPromise)

  return (
    <>
      <p id="page">/ssr-auto/cache-no-store</p>
      <div id="example-dat">{data}</div>
      <p id="date">{Date.now()}</p>
    </>
  )
}
