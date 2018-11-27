import React from 'react'
export default class ErrorInRenderPage extends React.Component {
  render () {
    if (typeof window !== 'undefined') {
      throw new Error('An Expected error occurred')
    }
    return <div />
  }
}
