import React from 'react'

export function Card(props) {
  return React.createElement('div', { ...props, className: 'card' }, 'workspace card')
}
