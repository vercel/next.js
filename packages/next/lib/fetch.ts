import unfetch from 'unfetch'
import fetchRetry from 'next-server/dist/lib/fetch/retry'

export { fetchRetry }
export default fetchRetry(unfetch)
