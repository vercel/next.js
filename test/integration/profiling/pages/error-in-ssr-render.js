import React from 'react'
export default class ErrorInRenderPage extends React.Component {
  render () {
    throw new Error('An Expected error occured')
  }
}
