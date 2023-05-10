import { unstable_cache } from 'next/cache'

export async function getServerSideProps() {
  const data = await unstable_cache(async () => {
    return {
      random: Math.random(),
    }
  })()

  return {
    props: {
      now: Date.now(),
      data,
    },
  }
}

export default function Page(props) {
  return (
    <>
      <p>/unstable-cache-node</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}
