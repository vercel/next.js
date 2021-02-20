import createFetch from '@vercel/fetch'

// since we aren't providing createFetch a fetcher it will use node-fetch as the fetcher
export default createFetch()
