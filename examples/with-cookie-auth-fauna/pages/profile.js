import { withAuthSync } from '../utils/auth'
import Layout from '../components/layout'
import useSWR from 'swr'
import Router from 'next/router'

const fetcher = (url) =>
  fetch(url).then((res) => {
    if (res.status >= 400 && res.status <= 499) {
      throw new Error('API Client error')
    }

    return res.json()
  })

const Profile = () => {
  const { data: user, error } = useSWR('/api/profile', fetcher)
  if (error) Router.push('/')
  return (
    <>
      {user && (
        <Layout>
          <h1>Your user id is {user.userId} </h1>
          <style jsx>{`
            h1 {
              margin-bottom: 0;
            }
          `}</style>
        </Layout>
      )}
    </>
  )
}

export default withAuthSync(Profile)
