// @ts-nocheck

// Package imports
import Image from "next/image";

// Type imports
import { FlexiblecontentFlexibleContentImageLayout } from "@/gql/graphql";

export default function ImageBlock({
  image,
}: FlexiblecontentFlexibleContentImageLayout) {
  if (!image) return null;

  return (
    <Image
      src={image?.node?.sourceUrl ?? ""}
      alt={image?.node?.altText ?? ""}
      width={image?.node?.mediaDetails?.width ?? 0}
      height={image?.node?.mediaDetails?.height ?? 0}
    />
  );
}
