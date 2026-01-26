import dynamic from 'next/dynamic'

const NestedIcon = dynamic(() => import('./nested/NestedIcon'))
const NestedStats = dynamic(() => import('./nested/NestedStats'))

export default function UserProfile({
  name,
  count,
}: {
  name: string
  count: number
}) {
  return (
    <div className="user-profile">
      <NestedIcon icon="user" />
      <h2>{name}</h2>
      <NestedStats value={count} />
    </div>
  )
}
