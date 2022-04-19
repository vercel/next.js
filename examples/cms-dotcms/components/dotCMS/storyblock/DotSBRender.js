import React from 'react'

import { BasicNodes, DotContent, TextNode, DotImage } from './components'

const components = {
  // Text Node
  text: TextNode,
  // Basic Nodes
  ...BasicNodes,
  // Custom nods
  //dotContent: DotContent,
  dotImage: DotImage,
}

const FallbackComponent = ({ type }) => {
  return (
    <>
      {process.env.NODE_ENV === 'development' ? (
        <span>
          You don&apos;t have a storyblock component for the content type:{' '}
          {type}
        </span>
      ) : (
        <></>
      )}
    </>
  )
}

/**
 * Dot Story Block Render
 */
export const DotSBRender = ({ content }) => {
  return (
    <>
      {content?.map((data, index) => {

        const Component = components[data.type] || FallbackComponent
        if (!data?.content?.length) {
          return <Component key={index} {...data} />
        }
          return (

          <Component  attrs={data.attrs} key={index} type={data?.type}>
            <DotSBRender key={index} {...data} />
          </Component>
        )
      })}
    </>
  )
}

export default DotSBRender
