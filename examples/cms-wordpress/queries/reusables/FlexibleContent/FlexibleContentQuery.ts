import { HeroQuery } from "@/queries/reusables/FlexibleContent/HeroQuery";
import { TextQuery } from "@/queries/reusables/FlexibleContent/TextQuery";
import { ImageQuery } from "@/queries/reusables/FlexibleContent/ImageQuery";
import { EmbeddedContentQuery } from "@/queries/reusables/FlexibleContent/EmbeddedContentQuery";

export const FlexibleContentQuery = `
flexiblecontent {
  flexibleContent {
      ${HeroQuery}
      ${TextQuery}
      ${ImageQuery}
      ${EmbeddedContentQuery}
    }
  }
`;
