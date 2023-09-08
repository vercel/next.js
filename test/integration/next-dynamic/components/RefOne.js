import React from 'react'

const RefOne = ({ children }, ref) => {
  return (
    <div ref={ref}>
      <div>1</div>
      {children}
    </div>
  )
}

export default React.forwardRef(RefOne)
