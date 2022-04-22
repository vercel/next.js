import React from 'react'

import { Heading, Paragraph, BulletList, OrderedList, DotImage, BlockQuote, CodeBlock } from './Blocks'

/**
 * Dot Story Block Render
 */
export const DotSBRender = ({ content }) => {
  return (
    <>
      {content?.map((data, index) => {
        switch (data.type) {
          case 'paragraph':
            return <Paragraph key={index} {...data} />

          case 'heading':
            return <Heading key={index} {...data} />

          case 'bulletList':
            return <BulletList key={index} {...data} />

          case 'orderedList':
            return <OrderedList key={index} {...data} />

          case 'dotImage':
            return <DotImage key={index} {...data} />

          case 'horizontalRule':
            return <hr key={index} />

          case 'blockquote':
            return <BlockQuote key={index} {...data} />

          case 'codeBlock':
            return <CodeBlock key={index} {...data} />

          case 'hardBreak':
            return <br key={index} />

          case 'default':
            return <p>Block not supported</p>
        }
      })}
    </>
  )
}

export default DotSBRender
