import { GetStaticPropsContext } from 'next'
import { log } from 'next-axiom'
import useSWR from 'swr'

export const getStaticProps = async (ctx: GetStaticPropsContext) => {
  log.info('Hello from SSR', { ctx })
  return {
    props: {},
  }
}

const fetcher = async (...args: any[]) => {
  log.info('Hello from SWR', { args })
  const res = await fetch.apply(null, [...args])
  return await res.json()
}

const Home = () => {
  const { data, error } = useSWR('/api/hello', fetcher)

  if (error) return <div>Failed to load</div>
  if (!data) return <div>Loading...</div>

  return (
    <div>
      <h1>{data.name}</h1>
    </div>
  )
}

export default Home
