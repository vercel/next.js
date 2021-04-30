import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { useAuth0 } from '@auth0/auth0-react'

export default function useComments() {
  const { getAccessTokenSilently } = useAuth0()
  const [text, textSet] = useState('')
  const [url, urlSet] = useState(null)

  const { data: comments, mutate } = useSWR(
    () => {
      const query = new URLSearchParams({ url })
      return `/api/comment?${query.toString()}`
    },
    {
      initialData: []
    }
  )

  useEffect(() => {
    const url = window.location.origin + window.location.pathname
    urlSet(url)
  }, [])

  const onSubmit = async (e) => {
    e.preventDefault()
    const token = await getAccessTokenSilently()

    try {
      await fetch('/api/comment', {
        method: 'POST',
        body: JSON.stringify({ url, text }),
        headers: {
          Authorization: token,
          'Content-Type': 'application/json'
        }
      })
      textSet('')
      await mutate()
    } catch (err) {
      console.log(err)
    }
  }

  const onDelete = async (comment) => {
    const token = await getAccessTokenSilently()

    try {
      await fetch('/api/comment', {
        method: 'DELETE',
        body: JSON.stringify({ url, comment }),
        headers: {
          Authorization: token,
          'Content-Type': 'application/json'
        }
      })
      await mutate()
    } catch (err) {
      console.log(err)
    }
  }

  return [text, textSet, comments, onSubmit, onDelete]
}
