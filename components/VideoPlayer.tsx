// components/VideoPlayer.tsx
import { useEffect, useRef } from "react";
import Hls from "hls.js";

type Props = { src?: string };

export default function VideoPlayer({ src }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, function (_, data) {
        console.error("HLS error", data);
      });
      return () => {
        hls.destroy();
      };
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
    } else {
      console.error("HLS not supported in this browser");
    }
  }, [src]);

  return <video ref={videoRef} controls style={{ width: "100%" }} playsInline />;
}
