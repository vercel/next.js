import { useQuery } from '@apollo/client'
import type { NextPage } from 'next'
import { useRouter } from 'next/dist/client/router'
import { GET_LAUNCHES_LIST_QUERY } from 'queries/getLaunchesList'

const List: NextPage = () => {
  const { back } = useRouter()
  const { data: { launches = [] } = {}, loading } = useQuery<{
    launches: { id: string; mission_id: string[]; mission_name: string }[]
  }>(GET_LAUNCHES_LIST_QUERY)

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <>
      <button onClick={back}>Back</button>
      {launches.length > 0 ? (
        <ul>
          {Array.from(new Set(launches)).map(
            ({ mission_name, mission_id, id }) => (
              <li key={`${id}-${mission_id[0]}`}>{mission_name}</li>
            )
          )}
        </ul>
      ) : (
        <div>No data</div>
      )}
    </>
  )
}

export default List
