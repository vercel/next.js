"use client";

import "@videojs/react/video/skin.css";

import { VideoPlayer as Player, VideoSkin } from "@videojs/react/video";
import { MuxVideo } from "@videojs/react/media/mux-video";
import { MuxData } from "@videojs/react/extensions/mux-data";

const metadata = { player_name: "with-mux-video" };

export default function VideoPlayer({ playbackId }: { playbackId: string }) {
  return (
    <Player>
      <VideoSkin className="w-full [--media-accent-color:var(--color-red-600)] [--media-border-radius:0]">
        <MuxVideo source={{ playbackId }} playsInline crossOrigin="anonymous" />
        <MuxData metadata={metadata} />
      </VideoSkin>
    </Player>
  );
}
