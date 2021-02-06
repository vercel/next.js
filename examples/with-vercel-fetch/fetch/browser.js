import createFetch from '@vercel/fetch'
import unfetch from 'unfetch'

export default createFetch(unfetch)
