'use client'

import useSWR from 'swr'

export default function Page() {
  const { error } = useSWR('/api/data', () => {
    throw new Error('boom')
  })
  if (error) throw error
}
