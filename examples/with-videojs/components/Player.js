import { useCallback, useEffect, useState } from 'react'
import videojs from 'video.js'
import 'videojs-youtube'

const Player = (props) => {
  const [videoEl, setVideoEl] = useState(null)
  const onVideo = useCallback((el) => {
    setVideoEl(el)
  }, [])

  useEffect(() => {
    const player = videojs(videoEl, props)
    return () => {
      player.dispose()
    }
  }, [props, videoEl])

  return (
    <div data-vjs-player>
      <video ref={onVideo} className="video-js" playsInline />
    </div>
  )
}

export default Player
