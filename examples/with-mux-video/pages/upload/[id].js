import Head from 'next/head'
import { useRouter } from 'next/router'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import useSwr from 'swr'
import VideoPlayer from '../../components/video-player'
const UploadForm = dynamic(() => import('../../components/upload-form'), {
  ssr: false,
  loading: () => <p>Loading...</p>,
})

const fetcher = url => fetch(url).then(res => res.json())

const Asset = ({ id, status, playbackId }) => {
  if (status === 'preparing') return <div>Preparing asset...</div>
  return <VideoPlayer src={`https://stream.mux.com/${playbackId}.m3u8`} />
}

export default function Upload() {
  /*
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  */
  const router = useRouter()
  const { data, error } = useSwr(
    () => (router.query.id ? `/api/upload/${router.query.id}` : null),
    fetcher
  )

  if (error) return <div>Failed to load</div>
  if (!data) return <div>Loading</div>

  /*
  const createUpload = async (evt) => {
    try {
      evt.preventDefault()
      await setIsLoading(true);
      const { uploadId } = await fetch('/api/uploads', {method: 'POST'}).then(res => res.json())
      Router.push(`/uploads/${uploadId}`);
    } catch (e) {
      console.error('Error in createUpload', e);
      setErrorMessage('Error creating upload')
    }
  }
  */

  const { upload, asset } = data

  const onUploadSuccess = () => console.log('debug upload success')

  return (
    <div className="container">
      <Head>
        <title>Mux Upload</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <h1 className="title">Upload a video</h1>
        <p className="description">status: {upload.status}</p>
        <div className="grid">
          {upload.status === 'timed_out' && (
            <div>
              This upload timed out.. <Link href="/">Go back</Link>
            </div>
          )}
          {upload.status === 'waiting' && (
            <UploadForm uploadUrl={upload.url} onSuccess={onUploadSuccess} />
          )}
          {upload.status === 'asset_created' && (
            <Asset
              status={asset.status}
              id={asset.id}
              playbackId={asset.playback_id}
            />
          )}
        </div>
      </main>

      <footer>
        <a
          href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by{' '}
          <img src="/vercel.svg" alt="Vercel Logo" className="logo" />
        </a>
      </footer>

      <style jsx>{`
        .container {
          min-height: 100vh;
          padding: 0 0.5rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }

        main {
          padding: 5rem 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }

        footer {
          width: 100%;
          height: 100px;
          border-top: 1px solid #eaeaea;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        footer img {
          margin-left: 0.5rem;
        }

        footer a {
          display: flex;
          justify-content: center;
          align-items: center;
        }

        a {
          color: inherit;
          text-decoration: none;
        }

        .title a {
          color: #0070f3;
          text-decoration: none;
        }

        .title a:hover,
        .title a:focus,
        .title a:active {
          text-decoration: underline;
        }

        .title {
          margin: 0;
          line-height: 1.15;
          font-size: 4rem;
        }

        .title,
        .description {
          text-align: center;
        }

        .description {
          line-height: 1.5;
          font-size: 1.5rem;
        }

        code {
          background: #fafafa;
          border-radius: 5px;
          padding: 0.75rem;
          font-size: 1.1rem;
          font-family: Menlo, Monaco, Lucida Console, Liberation Mono,
            DejaVu Sans Mono, Bitstream Vera Sans Mono, Courier New, monospace;
        }

        .grid {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;

          max-width: 800px;
          margin-top: 3rem;
        }

        .card {
          margin: 1rem;
          flex-basis: 45%;
          padding: 1.5rem;
          text-align: left;
          color: inherit;
          text-decoration: none;
          border: 1px solid #eaeaea;
          border-radius: 10px;
          transition: color 0.15s ease, border-color 0.15s ease;
        }

        .card:hover,
        .card:focus,
        .card:active {
          color: #0070f3;
          border-color: #0070f3;
        }

        .card h3 {
          margin: 0 0 1rem 0;
          font-size: 1.5rem;
        }

        .card p {
          margin: 0;
          font-size: 1.25rem;
          line-height: 1.5;
        }

        .logo {
          height: 1em;
        }

        @media (max-width: 600px) {
          .grid {
            width: 100%;
            flex-direction: column;
          }
        }
      `}</style>

      <style jsx global>{`
        html,
        body {
          padding: 0;
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto,
            Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue,
            sans-serif;
        }

        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  )
}
