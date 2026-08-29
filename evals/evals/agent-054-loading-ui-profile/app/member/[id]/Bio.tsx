'use client'

import { useEffect, useState } from 'react'
import { getMember, type Member } from '../../members'
import { Spinner } from '../../Spinner'

export function Bio({ id }: { id: string }) {
  const [member, setMember] = useState<Member | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    getMember(id).then((value) => {
      setMember(value)
      setIsLoading(false)
    })
  }, [id])

  if (isLoading) return <Spinner label="Loading bio" />
  if (!member) return <p>Member not found.</p>

  return (
    <section>
      <h1>{member.name}</h1>
      <p>{member.role}</p>
      <p>{member.bio}</p>
    </section>
  )
}
