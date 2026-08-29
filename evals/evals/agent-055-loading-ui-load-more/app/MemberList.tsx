'use client'

import { useState } from 'react'
import { getMembers, type MemberPage } from './members'

export function MemberList({ initialPage }: { initialPage: MemberPage }) {
  const [members, setMembers] = useState(initialPage.members)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(initialPage.hasMore)
  const [isLoading, setIsLoading] = useState(false)

  function loadMore() {
    const nextPage = page + 1
    setIsLoading(true)
    getMembers(nextPage).then((result) => {
      setMembers(result.members)
      setPage(nextPage)
      setHasMore(result.hasMore)
      setIsLoading(false)
    })
  }

  if (isLoading) return <div className="spinner" aria-label="Loading members" />

  return (
    <section>
      <ul key={page}>
        {members.map((member) => (
          <li key={member.id}>
            <strong>{member.name}</strong>
            <span>{member.role}</span>
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
