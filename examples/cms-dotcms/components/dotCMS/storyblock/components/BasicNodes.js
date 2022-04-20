import React from 'react'

// Styles
import { blockQuoteStyle, codeBlockStyle } from '../utils/Styles'

// Nodes
const HardBreak = () => <br />
const HorizontalRule = () => <hr />
const ListItem = ({ children }) => <li>{children}</li>
const OrderedList = ({ children }) => <ol>{children}</ol>
const Paragraph = ({ children }) => <p>{children}</p>
const UnorderedList = ({ children }) => <ul>{children}</ul>

const Heading = ({ attrs, children }) => {
  const Tag = `h${attrs.level}`
  return <Tag>{children}</Tag>
}

const BlockQuote = ({ children }) => (
  <blockquote style={blockQuoteStyle}>{children}</blockquote>
)
const CodeBlock = ({ attrs: { language }, children }) => (
  <pre data-language={language} style={codeBlockStyle}>
    <code>{children}</code>
  </pre>
)

export const BasicNodes = {
  paragraph: Paragraph,
  heading: Heading,
  listItem: ListItem,
  bulletList: UnorderedList,
  orderedList: OrderedList,
  codeBlock: CodeBlock,
  blockquote: BlockQuote,
  horizontalRule: HorizontalRule,
  hardBreak: HardBreak,
}
