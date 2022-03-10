import React, { useRef, useEffect } from 'react'

const Tooltip = (props) => {
  let timeout
  const toolTipRef = useRef(null)

  const showTip = () => {
    timeout = setTimeout(() => {
      toolTipRef.current.style.display = 'block'
    }, props.delay || 400)
  }

  const hideTip = () => {
    clearInterval(timeout)
    toolTipRef.current.style.display = 'none'
  }

  useEffect(() => {
    if (props.dynamic) {
      props.status !== 0 && (toolTipRef.current.style.display = 'block')
      timeout = setTimeout(() => {
        toolTipRef.current.style.display = 'none'
      }, props.delay || 400)
    }
  }, [props.content])

  return (
    <div
      className="Tooltip-Wrapper"
      onMouseEnter={showTip}
      onMouseLeave={hideTip}
    >
      {props.children}
      <div
        className={`Tooltip-Tip ${props.direction || 'top'}`}
        ref={toolTipRef}
      >
        {props.content}
      </div>
    </div>
  )
}

export default Tooltip
