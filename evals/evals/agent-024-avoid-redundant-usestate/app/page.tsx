'use client'

import { useState } from 'react'
import UserStats from './UserStats'

export default function Page() {
  const [users, setUsers] = useState([
    { id: 1, name: 'John', isActive: true },
    { id: 2, name: 'Jane', isActive: false },
    { id: 3, name: 'Bob', isActive: true },
  ])

  // Good example: derived value calculated directly
  const totalUsers = users.length

  return (
    <div>
      <h1>User Management</h1>
      <p>Total Users: {totalUsers}</p>

      <div>
        {users.map((user) => (
          <div key={user.id}>
            {user.name} - {user.isActive ? 'Active' : 'Inactive'}
          </div>
        ))}
      </div>

      <UserStats users={users} />
    </div>
  )
}
