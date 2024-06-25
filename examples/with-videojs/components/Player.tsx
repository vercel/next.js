import { useCallback, useEffect, useState } from "react";
import videojs from "video.js";
import "videojs-youtube";

interface PlayerProps {
  /**
   *
   */
  techOrder: string[];
  /**
   * Is autoplay enabled for this video?
   */
  autoplay: boolean;
  /**
   * Should this video have controls?
   */
  controls: boolean;
  /**
   * A list of video sources.
   */
  sources: {
    /**
     * The source url.
     */
    src: string;
    /**
     * The type of source
     */
    type: string;
  }[];
}

/**
 * A simple video player component for displaying videos from external websites.
 * @returns A Video.js video player element.
 */
const Player = (props: PlayerProps) => {
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const onVideo = useCallback((el: HTMLVideoElement) => {
    setVideoEl(el);
  }, []);

  useEffect(() => {
    if (videoEl == null) {
      return;
    }

    // our video.js player
    const player = videojs(videoEl, props);

    return () => {
      player.dispose();
    };
  }, [props, videoEl]);

  return (
    <>
      <h1>The implementation below is using react functions</h1>
      <div data-vjs-player>
        <video ref={onVideo} className="video-js" playsInline />
      </div>
    </>
  );
};

export default Player;
