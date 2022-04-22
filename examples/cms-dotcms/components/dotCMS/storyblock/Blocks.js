import React from 'react'
import { TextNode } from './TextNode'
import cn from 'classnames';
import DotCmsImage from "../../dotcms-image";

const Text = ({content}) => {
  return content.map((node, index) => <TextNode key={index} {...node} />)
}

// Nodes
export const DotImage = ({ attrs: { textAlign, data } }) => {
  const { asset, title } = data
  const [imgTitle] = title.split('.')

  return (
    <div className="w-full h-64 mb-4 relative" style={{ textAlign: textAlign }}>

      <DotCmsImage
        alt={`Cover Image for ${title}`}
        className={cn('shadow-small', {
          'hover:shadow-medium transition-shadow  duration-200': imgTitle,
        })}
        src={asset}
        layout="fill"
      />

    </div>
  )
}


export const ListItem = ({ content }) => {
  return <li>{content.map((item, index) => <Text content={item.content} key={index} />)}</li>
}
export const OrderedList = ({ content }) => <ol>{content.map((data, index) => <ListItem key={index} {...data} />)}</ol>
export const Paragraph = ({ content }) => {
  return <p>{<Text content={content} />}</p>
}
export const BulletList = ({ content }) => <ul>{content.map((data, index) => <ListItem key={index} {...data} />)}</ul>

export const Heading = ({ attrs, content }) => {
  const Tag = `h${attrs.level}`
  return <Tag><Text content={content} /></Tag>
}

export const BlockQuote = ({ content }) => {
  return <blockquote>{content.map((item, index) => <Text content={item.content} key={index} />)}</blockquote>
}
export const CodeBlock = ({ attrs: { language }, content }) => (
  <pre data-language={language}>
    <code><Text content={content} /></code>
  </pre>
)
