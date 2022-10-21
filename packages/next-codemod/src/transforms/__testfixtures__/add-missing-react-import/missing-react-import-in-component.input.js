import { Children, isValidElement } from 'react'

function Heading(props) {
  const { component, className, children, ...rest } = props
  return React.cloneElement(
    component,
    {
      className: [className, component.props.className || ''].join(' '),
      ...rest,
    },
    children
  )
}

export default Heading
