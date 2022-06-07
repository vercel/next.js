import '@mux-elements/mux-player';

export default function VideoPlayer({ playbackId }) {

  return (
    <>
      <mux-player
        playback-id={playbackId}
        stream-type="on-demand"
      ></mux-player>
      <style jsx>{`
        mux-player { 
          width: 100% 
        }
      `}</style>
    </>
  )
}
