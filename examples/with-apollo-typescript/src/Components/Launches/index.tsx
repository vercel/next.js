import React from 'react'
import Link from 'next/link'
import { useLaunchesQuery } from '@Generated'

export const Launches = (): JSX.Element => {
  const { data, loading } = useLaunchesQuery()
  if (loading) return <div>Loading...</div>
  return (
    <>
      <Link href="/">
        <a>Back</a>
      </Link>
      <ul>
        {data?.launches?.map((launch) => (
          <li key={launch?.id!}>{launch?.mission_name}</li>
        ))}
      </ul>
    </>
  )
}
