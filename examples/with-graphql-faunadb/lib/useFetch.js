import { useState, useEffect } from 'react'

export default function useFetch(url, options) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(url, options)
        const json = await res.json()

        setData(json)
      } catch (error) {
        setError(error)
      }
    }
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  return { data, error }
}
