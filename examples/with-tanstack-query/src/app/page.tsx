'use client'

import { useQuery } from '@tanstack/react-query'

type Post = {
  id: number
  title: string
  content: string
}

export default function Home() {
  const { data: posts, isLoading, error } = useQuery<Post[]>({
    queryKey: ['posts'],
    queryFn: async () => {
      const response = await fetch('/api/posts')
      if (!response.ok) {
        throw new Error('Failed to fetch posts')
      }
      return response.json()
    },
  })

  return (
    <div>
      <h1>TanStack Query Example</h1>
      
      {isLoading && <p>Loading posts...</p>}
      
      {error && <p>Error: {(error as Error).message}</p>}
      
      {posts && (
        <div>
          <h2>Posts</h2>
          <ul>
            {posts.map((post) => (
              <li key={post.id}>
                <h3>{post.title}</h3>
                <p>{post.content}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
