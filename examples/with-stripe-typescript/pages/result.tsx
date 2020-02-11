import { NextPage } from 'next'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '../components/Layout'
import PrintObject from '../components/PrintObject'

import { fetchGetJSON } from '../utils/api-helpers'
import useSWR from 'swr'

const ResultPage: NextPage = () => {
  const router = useRouter()

  // Fetch CheckoutSession from static page via
  // https://nextjs.org/docs/basic-features/data-fetching#static-generation
  const { data, error } = useSWR(
    router.query.session_id
      ? `/api/checkout_sessions/${router.query.session_id}`
      : null,
    fetchGetJSON
  )

  if (error) return <div>failed to load</div>

  return (
    <Layout title="Checkout Payment Result | Next.js + TypeScript Example">
      <h1>Checkout Payment Result</h1>
      <h2>Status: {data?.payment_intent?.status ?? 'loading...'}</h2>
      <p>
        Your Checkout Session ID:{' '}
        <code>{router.query.session_id ?? 'loading...'}</code>
      </p>
      <PrintObject content={data ?? 'loading...'} />
      <p>
        <Link href="/">
          <a>Go home</a>
        </Link>
      </p>
    </Layout>
  )
}

export default ResultPage
