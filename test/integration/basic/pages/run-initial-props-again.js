import React from 'react'

const Component = ({ fromServer, fromFirstRender }) =>
  <div>
    {fromServer ? 'fromServer' : ''}
    {fromFirstRender ? 'fromFirstRender' : ''}
  </div>

Component.getInitialProps = async ({ req, isFirstRender }) => {
  if (req) return { fromServer: true }
  else if (isFirstRender) return { fromFirstRender: true }
}

// Turn it on and off using a query for testing.
Component.runInitialPropsAgain = async ({ query }) => query.runInitialPropsAgain

export default Component
