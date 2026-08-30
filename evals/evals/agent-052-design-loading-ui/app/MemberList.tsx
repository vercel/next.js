'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getMembers, type Member } from './members'

export function MemberList() {
  const [members, setMembers] = useState<Member[]>([])
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    getMembers().then((result) => {
      setMembers(result.members)
      setIsLoading(false)
    })
  }, [])

  function search(nextQuery: string) {
    setQuery(nextQuery)
    setIsLoading(true)
    setMembers([])
    getMembers(nextQuery).then((result) => {
      setMembers(result.members)
      setIsLoading(false)
    })
  }

  if (members.length === 0) return <p>No members yet</p>

  if (isLoading) return <div className="spinner" aria-label="Loading members" />

  return (
    <section>
      <input
        type="search"
        aria-label="Search members"
        value={query}
        onChange={(event) => search(event.target.value)}
      />
      <ul className="member-list" key={query}>
        {members.map((member) => (
          <li key={member.id} className="member-row">
            <span className="avatar" />
            <span>
              <Link href={`/member/${member.id}`}>{member.name}</Link>
              <small>{member.role}</small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
