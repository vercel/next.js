import useSWR from 'swr'
import unfetch from '../../util/unfetch'

async function fetcher(path) {
  const data = await unfetch.get(path)
  return data
}

function HomePage() {
  const { data, error } = useSWR(
    'https://jsonplaceholder.typicode.com/users',
    fetcher
  )

  if (error) return <div>failed to load</div>
  if (!data) return <div>loading...</div>
  return (
    <>
      <h1>If you want report error about xhr. You can follow this repo.</h1>
      <div>User Total: {data.length}</div>
      <button
        onClick={() => unfetch.get('https://jsonplaceholder.typicode.com/user')}
      >
        A New Error Fetch
      </button>
    </>
  )
}

export default HomePage
