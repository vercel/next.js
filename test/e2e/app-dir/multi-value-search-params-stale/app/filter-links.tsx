'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

const KEY = 'f'

export function FilterLinks({ selected }: { selected: string[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  function buildUrl(toggle: string) {
    const p = new URLSearchParams(searchParams.toString())
    const cur = p.getAll(KEY)
    p.delete(KEY)
    const next = cur.includes(toggle)
      ? cur.filter((c) => c !== toggle)
      : [...cur, toggle]
    next.forEach((c) => p.append(KEY, c))
    const qs = p.toString()
    return qs ? `/?${qs}` : '/'
  }

  return (
    <div>
      {['a', 'b'].map((value) => (
        <Link key={value} id={`link-${value}`} href={buildUrl(value)}>
          toggle {value} (link)
        </Link>
      ))}
      {['a', 'b'].map((value) => (
        <button
          key={value}
          id={`replace-${value}`}
          onClick={() => {
            const url = buildUrl(value)
            startTransition(() => {
              router.replace(url, { scroll: false })
            })
          }}
        >
          toggle {value} (replace)
        </button>
      ))}
      <p id="client-values">client values: {JSON.stringify(selected)}</p>
    </div>
  )
}
