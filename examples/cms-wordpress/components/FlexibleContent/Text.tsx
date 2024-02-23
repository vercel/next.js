// @ts-nocheck

// Type imports
import { FlexiblecontentFlexibleContentTextLayout } from "@/gql/graphql";

export default function Text({
  text,
}: FlexiblecontentFlexibleContentTextLayout) {
  if (!text) return null;

  return <div dangerouslySetInnerHTML={{ __html: text }} />;
}
