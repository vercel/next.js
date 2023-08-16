'use client'

import { Boundary } from '#/ui/boundary'
import {
  useParams,
  usePathname,
  useSearchParams,
  useSelectedLayoutSegment,
  useSelectedLayoutSegments,
} from 'next/navigation'

export function HooksClient() {
  const pathname = usePathname()
  const params = useParams()
  const selectedLayoutSegment = useSelectedLayoutSegment()
  const selectedLayoutSegments = useSelectedLayoutSegments()
  const searchParams = useSearchParams()

  return (
    <Boundary labels={['Client Component Hooks']} size="small">
      <div className="overflow-x-auto text-sm text-white [color-scheme:dark]">
        <pre>
          {JSON.stringify(
            {
              usePathname: pathname,
              useParams: params,
              useSearchParams: searchParams
                ? Object.fromEntries(searchParams.entries())
                : {},
              useSelectedLayoutSegment: selectedLayoutSegment,
              useSelectedLayoutSegments: selectedLayoutSegments,
            },
            null,
            2
          )}
        </pre>
      </div>
    </Boundary>
  )
}
