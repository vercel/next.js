import Head from 'next/head'

import { getProfileData } from '../../fetchData/getProfileData'

export default function SSRPage({ data }) {
  const { username, profile } = data

  return (
    <div className="container">
      <Head>
        <title>Next.js w/ Firebase Client-Side</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <h1 className="title">Next.js w/ Firebase Server-Side</h1>
        <h2>{username}</h2>
        <p>{profile.message}</p>
      </main>
    </div>
  )
}

export const getServerSideProps = async ({ params }) => {
  const { username } = params
  const profile = await getProfileData(username)
  if (!profile) {
    return { notFound: true }
  }
  return { props: { data: { username, profile } } }
}
