import React from 'react'
import Document from '../md/markdown.mdx'

const H1 = props => <h1 style={{ color: 'tomato' }} {...props} />
const InlineCode = props => (
  <code id='codes' style={{ color: 'purple' }} {...props} />
)
const Code = props => <code id='codes' style={{ fontWeight: 600 }} {...props} />
const Pre = props => <pre id='codes' style={{ color: 'red' }} {...props} />

export default () => (
  <Document
    components={{ h1: H1, pre: Pre, code: Code, inlineCode: InlineCode }}
  />
)
