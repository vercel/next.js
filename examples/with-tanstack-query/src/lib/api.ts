export type Post = {
  id: number
  title: string
  content: string
}

function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // Client-side: use current origin
    return window.location.origin
  }
  
  // Server-side: construct absolute URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  
  // Development fallback
  return `http://localhost:${process.env.PORT ?? 3000}`
}

export async function fetchPosts(): Promise<Post[]> {
  const baseUrl = getBaseUrl()
  const response = await fetch(`${baseUrl}/api/posts`)
  if (!response.ok) {
    throw new Error('Failed to fetch posts')
  }
  return response.json()
}