'use client'

import { useEffect, useState } from 'react'
import { getMembers, type Member } from './members'

export function MemberList() {
  const [members, setMembers] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    getMembers().then((result) => {
      setMembers(result)
      setIsLoading(false)
    })
  }, [])

  if (isLoading) return <p>No members yet</p>

  return (
    <ul className="member-list">
      {members.map((member) => (
        <li key={member.id} className="member-row">
          <span className="avatar" />
          <span>
            <strong>{member.name}</strong>
            <small>{member.role}</small>
          </span>
        </li>
      ))}
    </ul>
  )
}
