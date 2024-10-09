import React from 'react'
import { foo } from './x-bundled'

export default function Page() {
  return <h1>My Page{foo}</h1>
}

export const dynamic = 'force-dynamic'
