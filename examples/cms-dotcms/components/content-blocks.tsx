import {
  BlockQuote,
  BulletList,
  CodeBlock,
  DotImage,
  Heading,
  ListItem,
  OrderedList,
  Paragraph,
  TextNode,
} from "./blocks";

/*
  dotCMS Block Editor is a new rich content editor that allows you to create your content as building blocks.

  More info: https://dotcms.com/docs/latest/block-editor
*/

export const ContentBlocks = ({ content }) => {
  return (
    <>
      {content?.map((data, index) => {
        switch (data.type) {
          case "paragraph":
            return (
              <Paragraph key={index}>
                <ContentBlocks content={data.content} />
              </Paragraph>
            );
          case "heading":
            return (
              <Heading key={index} level={data.attrs.level}>
                <ContentBlocks content={data.content} />
              </Heading>
            );

          case "bulletList":
            return (
              <BulletList key={index}>
                <ContentBlocks content={data.content} />
              </BulletList>
            );

          case "orderedList":
            return (
              <OrderedList key={index}>
                <ContentBlocks content={data.content} />
              </OrderedList>
            );

          case "dotImage":
            return <DotImage key={index} {...data} />;

          case "horizontalRule":
            return <hr key={index} />;

          case "blockquote":
            return (
              <BlockQuote key={index}>
                <ContentBlocks content={data.content} />
              </BlockQuote>
            );

          case "codeBlock":
            return (
              <CodeBlock language={data.attrs.language} key={index}>
                <ContentBlocks content={data.content} />
              </CodeBlock>
            );

          case "hardBreak":
            return <br key={index} />;

          case "text":
            return <TextNode key={index} {...data} />;

          case "listItem":
            return (
              <ListItem key={index}>
                <ContentBlocks content={data.content} />
              </ListItem>
            );

          default:
            return <p>Block not supported</p>;
        }
      })}
    </>
  );
};
