import React from 'react'

const dev = process.env.NODE_ENV === 'development'

// Note
// this component will only work for ENV = development
function CSSTag (props) {
  const { style } = props
  const element = dev && <style dangerouslySetInnerHTML={{ __html: style }} />
  return element
}

export default CSSTag
