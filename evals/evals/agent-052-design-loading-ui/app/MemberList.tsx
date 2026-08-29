'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getMembers, type Member } from './members'

export function MemberList() {
  const [members, setMembers] = useState<Member[]>([])
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    getMembers().then((result) => {
      setMembers(result.members)
      setHasMore(result.hasMore)
      setIsLoading(false)
    })
  }, [])

  function search(nextQuery: string) {
    setQuery(nextQuery)
    setPage(1)
    setIsLoading(true)
    setMembers([])
    getMembers(1, nextQuery).then((result) => {
      setMembers(result.members)
      setHasMore(result.hasMore)
      setIsLoading(false)
    })
  }

  function loadMore() {
    const nextPage = page + 1
    setIsLoading(true)
    getMembers(nextPage, query).then((result) => {
      setMembers(result.members)
      setPage(nextPage)
      setHasMore(result.hasMore)
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
      <ul className="member-list" key={`${query}-${page}`}>
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
      {hasMore ? (
        <button type="button" onClick={loadMore}>
          Load more
        </button>
      ) : null}
    </section>
  )
}
