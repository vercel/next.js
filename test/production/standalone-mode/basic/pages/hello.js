import useSWR, { useSWRConfig } from 'swr'

export default function Page() {
  const { data } = useSWR('hello', (v) => v, { fallbackData: 'hello' })
  const config = useSWRConfig()
  return `${data}-page`
}
