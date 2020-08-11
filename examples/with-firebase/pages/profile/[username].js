import Head from 'next/head'

import { gettProfileData } from '../../fetchData/getProfileData'

export default function SSRPage({ data }) {
  const { username, profileDataJson } = data
  const profileData = JSON.parse(profileDataJson)
  console.log(profileData)

  return (
    <div className="container">
      <Head>
        <title>Next.js w/ Firebase Client-Side</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <h1 className="title">Next.js w/ Firebase Server-Side</h1>
        <h2>{username}</h2>
      </main>
    </div>
  )
}

export const getServerSideProps = async ({ params }) => {
  const { username } = params
  const profileDataJson = await gettProfileData(username)
  return { props: { data: { username, profileDataJson } } }
}
