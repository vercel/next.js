import useSWR from 'swr'
import { withAuthSync } from '../utils/auth'
import Layout from '../components/layout'

const fetcher = async () => {
  let response = await fetch('/api/profile')
  let data = await response.json()
  return data
}

const Profile = () => {
  const { data, error } = useSWR('profile', fetcher)
  if (error) return <p>{error.message}</p>
  return (
    <Layout>
      <h1>Your user id is {data.userId} </h1>
      <style jsx>{`
        h1 {
          margin-bottom: 0;
        }
      `}</style>
    </Layout>
  )
}

export default withAuthSync(Profile)
