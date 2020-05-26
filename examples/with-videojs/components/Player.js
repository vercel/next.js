import { useRef, useEffect } from 'react'
import videojs from 'video.js'
import 'videojs-youtube'

const Player = (props) => {
  const playerRef = useRef()

  useEffect(() => {
    const player = videojs(playerRef.current, props)

    return () => {
      player.dispose()
    }
  }, [])

  return (
    <div data-vjs-player>
      <video ref={playerRef} className="video-js" playsInline />
    </div>
  )
}

export default Player
