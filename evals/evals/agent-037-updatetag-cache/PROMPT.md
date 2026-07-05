Create a Server Action that creates a new post. The posts list uses cache tags for caching.

After creating the post, invalidate the "posts" cache tag. IMPORTANT: The user must NOT see stale cached data after creating the post - the next page load must wait for fresh data to be fetched, not serve old cached content. Use the appropriate Next.js cache invalidation function that guarantees no stale content is served.
