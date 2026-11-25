'use client'

import { use } from 'react'

export function UseServerData({ serverData }: { serverData: Promise<string> }) {
  const data = use(serverData)
  return <p>{`Server data: ${data}`}</p>
}
