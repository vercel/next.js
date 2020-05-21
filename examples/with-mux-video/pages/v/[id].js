import Link from 'next/link'
import Layout from '../../components/layout'
import VideoPlayer from '../../components/video-player'
import Spinner from '../../components/spinner'
import { useRouter } from 'next/router'

export function getStaticProps({ params: { id: playbackId } }) {
  const src = `https://stream.mux.com/${playbackId}.m3u8`
  const poster = `https://image.mux.com/${playbackId}/thumbnail.png`

  return { props: { src, poster } }
}

export function getStaticPaths() {
  return {
    paths: [],
    fallback: true,
  }
}

export default function Playback({ src, poster }) {
  const router = useRouter()
  if (router.isFallback) {
    return (
      <Layout>
        <Spinner />
      </Layout>
    )
  }

  return (
    <Layout
      title="View your video"
      description="This page is sharable. Share this video by sharing the URL in your address bar."
      metaTitle="View this video created with Mux + NextJS"
      image={poster}
    >
      <VideoPlayer src={src} poster={poster} />
      <p>
        Go{' '}
        <Link href="/">
          <a>back home</a>
        </Link>{' '}
        to upload another video.
      </p>
      <style jsx>{`
        .code {
          font-family: courier;
        }
      `}</style>
    </Layout>
  )
}
