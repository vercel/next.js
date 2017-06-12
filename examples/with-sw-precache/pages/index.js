import React from 'react'

export default class extends React.PureComponent {
  componentDidMount() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then(registration => {
          console.log('service worker registration successful')
        })
        .catch(err => {
          console.warn('service worker registration failed')
        })
    }
  }
  render() {
    return (
      <p>Check the console for the Service Worker registration status.</p>
    )
  }
}
