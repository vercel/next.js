import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { getQueryClient } from '@/lib/get-query-client'
import { PostsList } from '@/components/posts-list'
import { fetchPosts } from '@/lib/api'

export default async function Home() {
  const queryClient = getQueryClient()
  
  // Prefetch data on server
  await queryClient.prefetchQuery({
    queryKey: ['posts'],
    queryFn: fetchPosts,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div>
        <h1>TanStack Query RSC Prefetch Example</h1>
        <p>Data is fetched on the server and passed to client components via cache.</p>
        
        {/* Client component will use the prefetched data */}
        <PostsList />
      </div>
    </HydrationBoundary>
  )
}
