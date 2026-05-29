import { YouTubeEmbed } from "@next/third-parties/google";

export default function Page() {
  return (
    <div>
      <YouTubeEmbed videoid="ogfYd705cRs" height={400} params="controls=0" />
    </div>
  );
}
