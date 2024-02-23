// @ts-nocheck

// Type imports
import { FlexiblecontentFlexibleContentEmbeddedContentLayout } from "@/gql/graphql";

export default function EmbeddedContent({
  embed,
}: FlexiblecontentFlexibleContentEmbeddedContentLayout) {
  if (!embed) return null;

  let iframeSrc = "";

  // Determine what type of embed it is based on the embed string, e.g. if it contains youtube.com, it's a youtube video
  switch (true) {
    case embed.includes("youtube.com"): {
      const youtubeId = embed.split("watch?v=")[1];
      iframeSrc = `https://www.youtube.com/embed/${youtubeId}?rel=0`;
      break;
    }

    case embed.includes("vimeo.com"): {
      const vimeoId = embed.split("vimeo.com/")[1];
      iframeSrc = `https://player.vimeo.com/video/${vimeoId}`;
      break;
    }

    default: {
      iframeSrc = embed;
      break;
    }
  }

  return (
    <iframe
      src={iframeSrc}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen={true}
    />
  );
}
