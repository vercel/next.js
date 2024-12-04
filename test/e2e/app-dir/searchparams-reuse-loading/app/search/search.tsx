'use client'

import { useRouter } from 'next/navigation'

export function Search() {
  let router = useRouter()

  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    let input = event.currentTarget.q.value
    let params = new URLSearchParams([['q', input]])
    router.push(`/search?${params}`)
  }

  return (
    <form onSubmit={search}>
      <input placeholder="Search..." name="q" className="border" />
      <button>Submit</button>
    </form>
  )
}
