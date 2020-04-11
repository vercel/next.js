import useSWR from 'swr'

const fetcher = url => fetch(url).then(r => r.json())

const Page = () => {
  const { data, error } = useSWR('/api/data', fetcher)

  return (
    <>
      <h1>Personalized Page using SWR</h1>

      <div>
        This is the personalized page. Try also reloading the page to trigger
        server side rendering.
      </div>

      <div>{error}</div>

      <div>{data && data.message}</div>
    </>
  )
}

export default Page
