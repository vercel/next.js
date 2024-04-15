import React from 'react'

export default React.forwardRef((props, ref) => (
  <span {...props} forwardedRef={ref}>
    This is a component with a forwarded ref
  </span>
))
