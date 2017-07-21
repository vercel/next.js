import React from 'react'

const Component = ({ fromServer, fromFirstRender }) =>
  <div>
    {fromServer ? 'fromServer' : ''}
    {fromFirstRender ? 'fromFirstRender' : ''}
  </div>

Component.getInitialProps = async ({ req, serverProps }) => {
  if (req) return { fromServer: true }
  else if (serverProps) return { fromFirstRender: true }
}

// Turn it on and off using a query for testing.
Component.runInitialPropsAgain = async ({ query }) => query.runInitialPropsAgain

export default Component
