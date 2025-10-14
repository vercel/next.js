'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchPosts } from '@/lib/api'

export function PostsList() {
  const { data: posts, isLoading, error } = useQuery({
    queryKey: ['posts'],
    queryFn: fetchPosts,
  })

  if (isLoading) return <p>Loading posts...</p>
  if (error) return <p>Error: {(error as Error).message}</p>

  return (
    <div>
      <h2>Posts (from cache)</h2>
      <ul>
        {posts?.map((post) => (
          <li key={post.id}>
            <h3>{post.title}</h3>
            <p>{post.content}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}