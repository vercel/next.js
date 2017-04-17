import React from 'react'

let currentChunks = []

export default function dynamicComponent (promise, Loading = () => (<p>Loading...</p>)) {
  return class Comp extends React.Component {
    constructor (...args) {
      super(...args)
      this.state = { AsyncComponent: null }
      this.isServer = typeof window === 'undefined'
      this.loadComponent()
    }

    loadComponent () {
      promise.then((AsyncComponent) => {
        if (this.mounted) {
          this.setState({ AsyncComponent })
        } else {
          if (this.isServer) {
            currentChunks.push(AsyncComponent.__webpackChunkName)
          }
          this.state.AsyncComponent = AsyncComponent
        }
      })
    }

    componentDidMount () {
      this.mounted = true
    }

    render () {
      const { AsyncComponent } = this.state
      if (!AsyncComponent) return (<Loading {...this.props} />)

      return <AsyncComponent {...this.props} />
    }
  }
}

export function flushChunks () {
  const chunks = currentChunks
  currentChunks = []
  return chunks
}
