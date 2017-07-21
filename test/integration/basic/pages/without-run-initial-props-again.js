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

// Don't include runInitialPropsAgain.

export default Component
