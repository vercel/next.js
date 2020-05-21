import { useEffect } from 'react'
import Router, { useRouter } from 'next/router'
import useSwr from 'swr'
import Layout from '../../components/layout'
import Spinner from '../../components/spinner'

const fetcher = (url) => {
  return fetch(url).then((res) => res.json())
}

const ErrorMessage = ({ message }) => (
  <>
    <div className="message">{message || 'Unknown error'}</div>
    <style jsx>{`
      .message {
        color: #d61313;
      }
    `}</style>
  </>
)

const Preparing = () => {
  const router = useRouter()

  const { data, error } = useSwr(
    () => (router.query.id ? `/api/asset/${router.query.id}` : null),
    fetcher,
    { refreshInterval: 5000 }
  )

  const asset = data && data.asset

  useEffect(() => {
    if (asset && asset.playback_id && asset.status === 'ready') {
      Router.push(`/v/${asset.playback_id}`)
    }
  }, [asset])

  if (error) return <ErrorMessage message="Error fetching api" />
  if (data && data.error) return <ErrorMessage message={data.error} />

  return (
    <>
      <div className="container">
        <p>Preparing..</p>
        <Spinner />
      </div>
      <style jsx>{`
        .container {
          min-height: 220px;
        }
        input {
          display: none;
        }
      `}</style>
    </>
  )
}

export default function Home() {
  return (
    <Layout
      title="Welcome to Mux + Next.js"
      description="Get started by uploading a video"
    >
      <Preparing />
    </Layout>
  )
}
