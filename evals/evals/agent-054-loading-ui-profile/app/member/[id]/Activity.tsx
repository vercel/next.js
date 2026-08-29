'use client'

import { useEffect, useState } from 'react'
import { getActivity, type ActivityItem } from '../../members'
import { Spinner } from '../../Spinner'

export function Activity({ id }: { id: string }) {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    getActivity(id).then((value) => {
      setItems(value)
      setIsLoading(false)
    })
  }, [id])

  if (isLoading) return <Spinner label="Loading activity" />

  return (
    <section>
      <h2>Activity</h2>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.label}</li>
        ))}
      </ul>
    </section>
  )
}
