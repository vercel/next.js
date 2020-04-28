import Avatar from '../components/avatar'
import VideoPlayer from '../components/video-player'

export default function PostVideo({ video: { streamingUrl }}) {
  return (
    <>
      <div className="max-w-2xl mx-auto">
        {streamingUrl && <VideoPlayer src={streamingUrl} />}
      </div>
    </>
  )
}
