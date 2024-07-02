"use client";

import { useContentfulInspectorMode } from "@contentful/live-preview/react";
import Image from "next/image";

interface ContentfulImageProps {
  id: string;
  src: string;
  width?: number;
  quality?: number;
  [key: string]: any; // For other props that might be passed
}

const contentfulLoader = ({
  src,
  width,
  quality,
}: {
  src: string;
  width?: number;
  quality?: number;
}) => {
  return `${src}?w=${width}&q=${quality || 75}`;
};

export default function ContentfulImage(props: ContentfulImageProps) {
  const inspectorProps = useContentfulInspectorMode({ assetId: props.id });

  return (
    <Image
      {...inspectorProps({ fieldId: "file" })}
      alt={props.alt}
      loader={contentfulLoader}
      {...props}
    />
  );
}
