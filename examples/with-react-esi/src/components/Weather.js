import React from 'react'

/**
 * Return the weather. This component is not loaded on the homepage, to test that getInitialProps works client-side too.
 */
export default class Weather extends React.Component {
  static async getInitialProps({ props, req, res }) {
    // Fetch the weather from a remote API, it may take some time...
    return new Promise(resolve => {
      console.log(typeof window !== 'undefined' ? 'client-side' : 'server-side')
      // Simulate a delay (slow network, huge computation...)
      setTimeout(
        () =>
          resolve({
            ...props, // Props from the main page, passed through the internal fragment URL server-side
            weather: 'sunny ☀️',
          }),
        2000
      )
    })
  }

  render() {
    console.log(typeof window !== 'undefined' ? 'client-side' : 'server-side')

    return (
      <section>
        <h1>Weather</h1>
        {this.props.weather}

        <div>
          <small>generated at {new Date().toISOString()}</small>
        </div>
      </section>
    )
  }
}
