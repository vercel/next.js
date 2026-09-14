interface User {
  id: number
  name: string
  isActive: boolean
}

interface UserStatsProps {
  users: User[]
}

export default function UserStats({ users }: UserStatsProps) {
  // TODO: Display statistics about the users:
  // - Active users count
  // - Inactive users count
  // - Percentage of active users
  // Follow the existing patterns in this codebase for derived values

  return (
    <div>
      <h2>User Statistics</h2>
      <p>Stats will go here</p>
    </div>
  )
}
