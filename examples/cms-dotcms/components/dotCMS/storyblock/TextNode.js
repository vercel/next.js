import React from 'react'

import { Link, Bold, Italic, Strike, Underline } from './Marks'


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

  return (
    <>
      {Component ? (
        <>
          <Component attrs={mark.attrs}>
            <TextNode {...newProps} />
          </Component>
        </>
      ) : (
        <>{text}</>
      )}
    </>
  )
}
