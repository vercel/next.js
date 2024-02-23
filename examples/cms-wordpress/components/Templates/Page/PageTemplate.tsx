import { ContentNode, Page } from "@/gql/graphql";
import { fetchGraphQL } from "@/utils/fetchGraphQL";
import { PageQuery } from "./PageQuery";

interface TemplateProps {
  node: ContentNode;
}

export default async function PageTemplate({ node }: TemplateProps) {
  const { page } = await fetchGraphQL<{ page: Page }>(PageQuery, {
    id: node.databaseId,
  });

  // return FlexibleContent(node.databaseId, page?.flexiblecontent?.flexibleContent as FlexiblecontentFlexibleContent_Layout[]);
  return <div dangerouslySetInnerHTML={{ __html: page?.content || " " }} />;
}
