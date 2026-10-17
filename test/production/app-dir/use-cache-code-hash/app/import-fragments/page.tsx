import { cachedFirst, cachedSecond, cachedShared, nonCache } from './logic'

export default async function Page() {
  const unrelated = nonCache()
  return (
    <p>
      {await cachedFirst()}:{await cachedSecond()}:{await cachedShared()}:
      {unrelated}
    </p>
  )
}
