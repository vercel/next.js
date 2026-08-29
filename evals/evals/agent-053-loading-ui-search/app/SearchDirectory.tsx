'use client'

import { useState } from 'react'
import { searchMembers, type Member } from './members'

export function SearchDirectory({
  initialMembers,
}: {
  initialMembers: Member[]
}) {
  const [members, setMembers] = useState(initialMembers)
  const [isLoading, setIsLoading] = useState(false)

  function onSearch(query: string) {
    setIsLoading(true)
    setMembers([])
    searchMembers(query).then((next) => {
      setMembers(next)
      setIsLoading(false)
    })
  }

  return (
    <section>
      <input
        type="search"
        aria-label="Search members"
        onChange={(event) => onSearch(event.target.value)}
      />
      {isLoading ? (
        <div className="spinner" aria-label="Searching" />
      ) : members.length === 0 ? (
        <p>No members match.</p>
      ) : (
        <ul>
          {members.map((member) => (
            <li key={member.id}>
              <strong>{member.name}</strong>
              <span>{member.role}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
