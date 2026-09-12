'use client'

import React from 'react'

// This will be a mapping object for all your MDX files
import StuffMdx from './stuff.mdx'
import AnotherMdx from './another.mdx'
// ... import all your MDX files

const mdxComponents = {
  './stuff.mdx': StuffMdx,
  './another.mdx': AnotherMdx,
  // ... map all your imports
}

export default function MdxLoader({ filePath }) {
  const Component = mdxComponents[filePath]

  if (!Component) {
    return <div>MDX file not found: {filePath}</div>
  }

  return <Component />
}
