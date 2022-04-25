import React from 'react'
import cn from 'classnames';
import DotCmsImage from "./dotcms-image";
import DotLink from './link'

export const Bold = ({ children }) => <strong>{children}</strong>
export const Italic = ({ children }) => <em>{children}</em>
export const Strike = ({ children }) => <s>{children}</s>
export const Underline = ({ children }) => <u>{children}</u>
export const Link = ({ attrs: { href, target }, children }) => (
  <DotLink href={href} target={target}>
    {children}
  </DotLink>
)

const nodeMarks = {
  link: Link,
  bold: Bold,
  underline: Underline,
  italic: Italic,
  strike: Strike,
}

export const TextNode = (props) => {
  const { marks = [], text } = props
  const mark = marks[0] || { type: '', attrs: {} }
  const newProps = { ...props, marks: marks.slice(1) }
  const Component = nodeMarks[mark?.type]

  if (!Component) {
    return text
  }

  return <Component attrs={mark.attrs}>
    <TextNode {...newProps} />
  </Component>
}

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

export const ListItem = ({ children }) => {
  return <li>{children}</li>
}

export const OrderedList = ({ children }) => {
  return <ol>{children}</ol>
}

export const Paragraph = ({ children }) => {
  return <p>{children}</p>
}

export const BulletList = ({ children }) => {
  return <ul>{children}</ul>
}

export const Heading = ({ level,  children }) => {
  const Tag = `h${level}`
  return <Tag>{children}</Tag>
}

export const BlockQuote = ({ children }) => {
  return <blockquote>{children}</blockquote>
}

export const CodeBlock = ({ language, children }) => {
  return <pre data-language={language}>
  <code>{children}</code>
</pre>
}
