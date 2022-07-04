import { log } from 'next-axiom'
import useSWR from 'swr'

export async function getStaticProps(context) {
  log.info('Hello from SSR', { context })
  return {
    props: {},
  }
}

const fetcher = async (...args) => {
  log.info('Hello from SWR', { args });
  const res = await fetch(...args);
  return await res.json();
}

export default function Home() {
  const { data, error } = useSWR('/api/hello', fetcher)

  if (error) return <div>Failed to load</div>
  if (!data) return <div>Loading...</div>

  return (
    <div>
      <h1>{data.name}</h1>
    </div>
  )
}
