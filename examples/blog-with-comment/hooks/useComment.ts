import type { Comment } from '../types'
import React, { useState } from 'react'
import useSWR from 'swr'

const fetcher = (url) => fetch(url).then((res) => res.json())

export default function useComments() {
  const [text, setText] = useState('')

  const { data: comments, mutate } = useSWR<Comment[]>(
    '/api/comment',
    fetcher,
    { fallbackData: [] }
  )

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      await fetch('/api/comment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      })
      setText('')
      await mutate()
    } catch (err) {
      console.log(err)
    }
  }

  const onDelete = async (comment: Comment) => {
    try {
      await fetch('/api/comment', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ comment }),
      })
      await mutate()
    } catch (err) {
      console.log(err)
    }
  }

  return { text, setText, comments, onSubmit, onDelete }
}
