import { useCallback, useEffect, useState } from 'react'
import videojs from 'video.js'
import 'videojs-youtube'

interface PlayerProps {
  techOrder: string[]
  autoplay: boolean
  controls: boolean
  sources: { src: string; type: string }[]
}

export default function Player(props: PlayerProps) {
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)
  const onVideo = useCallback((el: HTMLVideoElement) => {
    setVideoEl(el)
  }, [])

  useEffect(() => {
    if (videoEl == null) return
    const player = videojs(videoEl, props)
    return () => {
      player.dispose()
    }
  }, [props, videoEl])

  return (
    <>
      <h1>The implementation below is using react functions</h1>
      <div data-vjs-player>
        <video ref={onVideo} className="video-js" playsInline />
      </div>
    </>
  )
}
