import useSWR from 'swr'

const fetcher = (url) => fetch(url).then((res) => res.text())

export default function Index() {
  const { data, error } = useSWR('/api/cookies', fetcher)

  if (error) return <div>Failed to load</div>
  if (!data) return <div>Loading...</div>

  return <div>{`Cookie from response: "${data}"`}</div>
}
