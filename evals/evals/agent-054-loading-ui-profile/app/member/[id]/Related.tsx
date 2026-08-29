'use client'

import { useEffect, useState } from 'react'
import { getRelated, type Member } from '../../members'
import { Spinner } from '../../Spinner'

export function Related({ id }: { id: string }) {
  const [people, setPeople] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    getRelated(id).then((value) => {
      setPeople(value)
      setIsLoading(false)
    })
  }, [id])

  if (isLoading) return <Spinner label="Loading related people" />

  return (
    <section>
      <h2>Related people</h2>
      <ul>
        {people.map((person) => (
          <li key={person.id}>{person.name}</li>
        ))}
      </ul>
    </section>
  )
}
