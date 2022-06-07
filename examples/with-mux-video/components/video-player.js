import '@mux-elements/mux-player';
import { useEffect, useRef } from 'react'
import Hls from 'hls.js'

export default function VideoPlayer({ src, poster, playbackId }) {
  // const videoRef = useRef(null)

  // useEffect(() => {
  //   const video = videoRef.current
  //   if (!video) return

  //   video.controls = true
  //   let hls

  //   if (video.canPlayType('application/vnd.apple.mpegurl')) {
  //     // This will run in safari, where HLS is supported natively
  //     video.src = src
  //   } else if (Hls.isSupported()) {
  //     // This will run in all other modern browsers
  //     hls = new Hls()
  //     hls.loadSource(src)
  //     hls.attachMedia(video)
  //   } else {
  //     console.error(
  //       'This is an old browser that does not support MSE https://developer.mozilla.org/en-US/docs/Web/API/Media_Source_Extensions_API'
  //     )
  //   }

  //   return () => {
  //     if (hls) {
  //       hls.destroy()
  //     }
  //   }
  // }, [src, videoRef])

  return (
    <>
      <mux-player
        playback-id={playbackId}
      ></mux-player>
    </>
  )
}
