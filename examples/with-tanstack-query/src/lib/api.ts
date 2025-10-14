export type Post = {
  id: number
  title: string
  content: string
}

export async function fetchPosts(): Promise<Post[]> {
  const response = await fetch('http://localhost:3000/api/posts')
  if (!response.ok) {
    throw new Error('Failed to fetch posts')
  }
  return response.json()
}