import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import useSwr from 'swr'
import Layout from '../../components/layout'
import Spinner from '../../components/spinner'
import VideoPlayer from '../../components/video-player'
const UploadForm = dynamic(() => import('../../components/upload-form'), {
  ssr: false,
  loading: () => <Spinner />,
})

const fetcher = url => {
  return fetch(url).then(res => res.json())
}

const Asset = ({ id, status, playbackId }) => {
  if (status === 'preparing')
    return (
      <div>
        <div>Preparing asset...</div>
        <Spinner />
      </div>
    )
  const src = `https://stream.mux.com/${playbackId}.m3u8`
  return (
    <div>
      <p>
        Your video is now ready for playback. View your video here or try using
        this URL in a player that supports HLS playback:
      </p>
      <p className="code">{src}</p>
      <VideoPlayer src={src} />
      <style jsx>{`
        .code {
          padding-bottom: 30px;
          font-family: courier;
        }
      `}</style>
    </div>
  )
}

export default function Upload() {
  const [shouldPoll, setShouldPoll] = useState(false)
  const router = useRouter()
  const { data, error } = useSwr(
    () => (router.query.id ? `/api/upload/${router.query.id}` : null),
    fetcher,
    { refreshInterval: shouldPoll ? 5000 : 0 }
  )

  const upload = data && data.upload
  const asset = data && data.asset

  useEffect(() => {
    const uploadIsWaiting = upload && upload.status === 'waiting'
    const assetIsPreparing = asset && asset.status === 'preparing'
    if (uploadIsWaiting || assetIsPreparing) {
      setShouldPoll(true)
    } else {
      setShouldPoll(false)
    }
  }, [upload, asset])

  if (error)
    return (
      <Layout>
        <div>Failed to load</div>
      </Layout>
    )
  if (!data)
    return (
      <Layout>
        <Spinner />
      </Layout>
    )

  const onUploadStart = () => setShouldPoll(false)
  const onUploadSuccess = () => setShouldPoll(true)
  const getTitle = () => {
    if (asset && asset.status === 'ready') return 'Your video'
    return 'Upload a video'
  }
  const getStatus = () => `status: ${asset ? asset.status : upload.status}`

  return (
    <Layout title={getTitle()} description={getStatus()}>
      {upload.status === 'timed_out' && (
        <div>
          This upload timed out.. <Link href="/">Go back</Link>
        </div>
      )}
      {upload.status === 'waiting' && (
        <UploadForm
          uploadUrl={upload.url}
          onStart={onUploadStart}
          onSuccess={onUploadSuccess}
        />
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
