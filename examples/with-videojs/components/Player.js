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
  }, [playerRef, props])

  return (
    <>
      <h1>The implementation below is using react functions</h1>
      <div data-vjs-player>
        <video ref={playerRef} className="video-js" playsInline />
      </div>
    </>
  )
}

export default Player
