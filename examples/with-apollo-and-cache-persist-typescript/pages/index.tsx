import type { NextPage, GetServerSideProps } from 'next'
import Link from 'next/link'
import {
  addApolloState,
  initializeApollo,
  PERSISTOR_CACHE_KEY,
} from 'lib/apollo/apolloClient'
import { GET_COMPANY_DATA_QUERY } from 'queries/getCompanyData'
import styles from 'styles/Home.module.css'

type Props = {
  company: { name: string; summary: string }
}

const Home: NextPage<Props> = ({ company }) => {
  const { name, summary } = company

  return (
    <>
      <h1>Welcome to the {name} launches list!</h1>
      <div>{summary}</div>
      <div className={styles.info}>
        After first load, cache will be added to the local storage with a key
        called <b>{PERSISTOR_CACHE_KEY}</b>. When you will go to the /list page,
        cache will be populated with more data. Try to reload the application or
        visit it in other tab and go the /list to see that data will be loaded
        from the cache that was persisted in local storage.
      </div>
      <div className={styles.link}>
        <Link href="/list">Go to the launches list!</Link>
      </div>
    </>
  )
}

export const getServerSideProps: GetServerSideProps = async () => {
  try {
    const apolloClient = initializeApollo()

    const {
      data: { company },
    } = await apolloClient.query<{
      company: { name: string; summary: string }
    }>({
      query: GET_COMPANY_DATA_QUERY,
    })

    return addApolloState(apolloClient, { props: { company } })
  } catch (error) {
    console.log(error)

    return { notFound: true }
  }
}

export default Home
