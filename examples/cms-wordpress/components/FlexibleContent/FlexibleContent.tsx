// @ts-nocheck

// Package imports
import dynamic from "next/dynamic";

// Type imports
import {
  FlexiblecontentFlexibleContent_Layout,
  FlexiblecontentFlexibleContentHeroLayout,
  FlexiblecontentFlexibleContentTextLayout,
  FlexiblecontentFlexibleContentImageLayout,
  FlexiblecontentFlexibleContentEmbeddedContentLayout,
} from "@/gql/graphql";

// Components imports
const Hero = dynamic(() => import("@/components/FlexibleContent/Hero"));
const Text = dynamic(() => import("@/components/FlexibleContent/Text"));
const ImageBlock = dynamic(() => import("@/components/FlexibleContent/Image"));
const EmbeddedContent = dynamic(
  () => import("@/components/FlexibleContent/EmbeddedContent"),
);

export default async function FlexibleContent(
  id: number,
  blocks?: FlexiblecontentFlexibleContent_Layout[],
) {
  const displayBlocks = (
    block:
      | FlexiblecontentFlexibleContentHeroLayout
      | FlexiblecontentFlexibleContentTextLayout
      | FlexiblecontentFlexibleContentImageLayout
      | FlexiblecontentFlexibleContentEmbeddedContentLayout,
    index: number,
  ) => {
    switch (true) {
      case block.fieldGroupName === "FlexiblecontentFlexibleContentHeroLayout":
        return (
          <Hero
            key={id}
            id={id}
            {...(block as FlexiblecontentFlexibleContentHeroLayout)}
          />
        );

      case block.fieldGroupName === "FlexiblecontentFlexibleContentTextLayout":
        return (
          <Text
            {...(block as FlexiblecontentFlexibleContentTextLayout)}
            key={index}
          />
        );

      case block.fieldGroupName === "FlexiblecontentFlexibleContentImageLayout":
        return (
          <ImageBlock
            {...(block as FlexiblecontentFlexibleContentImageLayout)}
            key={index}
          />
        );

      case block.fieldGroupName ===
        "FlexiblecontentFlexibleContentEmbeddedContentLayout":
        return (
          <EmbeddedContent
            {...(block as FlexiblecontentFlexibleContentEmbeddedContentLayout)}
            key={index}
          />
        );

      default: {
        return `${block.fieldGroupName} is not implemented`;
      }
    }
  };

  if (!blocks) return null;

  return blocks.map(
    (block, index: number) => block && displayBlocks(block, index),
  );
}
