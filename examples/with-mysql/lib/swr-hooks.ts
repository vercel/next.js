import useSWR from 'swr'

export function useEntries() {
  const {data, error} = useSWR(`/api/get-entries`, fetcher)

  function fetcher(url) {
    return window.fetch(url).then(res => res.json())
  }

  return {
    entries: data,
    isLoading: !error && !data,
    isError: error
  }
}