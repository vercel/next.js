'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

export function DialogLinks({
  basePath,
  prefetch,
}: {
  basePath: string
  prefetch?: true
}) {
  const searchParams = useSearchParams()
  const search = searchParams.toString() ? `?${searchParams}` : ''

  return (
    <ul>
      <li>
        <Link href={`${basePath}?tab=all`} id="tab-all">
          all
        </Link>
      </li>
      <li>
        <Link href={`${basePath}?tab=archive`} id="tab-archive">
          archive
        </Link>
      </li>
      <li>
        <Link
          href={`${basePath}/dialog${search}`}
          prefetch={prefetch}
          id="open-dialog"
        >
          Open dialog ({`${basePath}/dialog${search}`})
        </Link>
      </li>
    </ul>
  )
}
