import Counter from '../components/counter'
import { bodyParser } from '../utils'

const Page = ({ initialCount }) => {
  return (
    <div>
      <h1>Index</h1>
      <Counter initialCount={initialCount} />
    </div>
  )
}
export default Page

export const getServerSideProps = async ({ req }) => {
  let initialCount = 0
  if (req.method === 'PUT') {
    const data = await bodyParser(req)
    initialCount = data.count || 0
    initialCount += 1
  }
  return {
    props: {
      initialCount,
    },
  }
}

export const serverSidePropsFetcher = async (url, options) => {
  /**
   * This function replaces the `fetch` function that is used internally
   * when moving to the page where `getServerSideProps` is defined.
   * [!] This function only runs in the browser environment.
   * @see https://www.npmjs.com/package/node-fetch
   */
  return fetch(url, {
    ...options,
    method: 'put',
    body: JSON.stringify(window?.__store__ || {}),
    headers: { 'Content-Type': 'application/json' },
  })
}
