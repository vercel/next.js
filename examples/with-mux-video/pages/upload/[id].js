import { useRouter } from 'next/router'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import useSwr from 'swr'
import Layout from '../../components/layout'
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
  const router = useRouter()
  const { data, error } = useSwr(
    () => (router.query.id ? `/api/upload/${router.query.id}` : null),
    fetcher,
    { refreshInterval: 5000 }
  )

  if (error)
    return (
      <Layout>
        <div>Failed to load</div>
      </Layout>
    )
  if (!data)
    return (
      <Layout>
        <div>Loading</div>
      </Layout>
    )

  const { upload, asset } = data

  const onUploadSuccess = () => console.log('debug upload success')

  return (
    <Layout title="Upload a video" description={`status: ${upload.status}`}>
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
    </Layout>
  )
}
