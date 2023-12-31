import React from 'react'

import './index.scss'

const baseClass = 'rich-text-label'

const LabelElement: React.FC<{
  attributes: any
  element: any
  children: React.ReactNode
}> = ({ attributes, children }) => (
  <div {...attributes}>
    <span className={baseClass}>{children}</span>
  </div>
)
export default LabelElement
