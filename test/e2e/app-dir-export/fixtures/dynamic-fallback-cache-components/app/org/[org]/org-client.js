'use client'

import { useParams } from 'next/navigation'

export default function OrgClient() {
  const params = useParams()

  return <p id="org-name">Org {params.org}</p>
}
