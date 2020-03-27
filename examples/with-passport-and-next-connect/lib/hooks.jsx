import useSWR from 'swr'

const fetcher = url => fetch(url).then(r => r.json())

export function usePost() {
  const { data, mutate } = useSWR('/api/posts', fetcher)
  const posts = data?.posts
  return [posts, { mutate }]
}

export function useUser() {
  const { data, mutate } = useSWR('/api/user', fetcher)
  const user = data?.user
  return [user, { mutate }]
}
