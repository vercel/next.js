import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '../../components/layout'
import VideoPlayer from '../../components/video-player'

export default function Asset () {
  const router = useRouter()
  if (!router.query.id) return <Layout title='Your video'></Layout>

  const src = `https://stream.mux.com/${router.query.id}.m3u8`
  return (
    <Layout
      title="View your video"
      description="This page is sharable. Share this video by sharing the URL in your address bar."
    >
      <VideoPlayer src={src} />
      <p>
        Go <Link href='/'><a>back home</a></Link> to upload another video.
      </p>
      <style jsx>{`
        .code {
          font-family: courier;
        }
      `}</style>
    </Layout>
  )
}
