import React from 'react'
import { fetchUserRepos } from '../githubApi'
import provideStateFactory from '../provideState'

export default Page => {
  const App = ({ serverState }) => {
    const withState = provideStateFactory(serverState)
    const PageWithState = withState(Page)

    return <PageWithState />
  }

  App.getInitialProps = async () => {
    const username = 'arunoda'
    const page = 1
    const repos = await fetchUserRepos(username, page)

    return {
      serverState: {
        githubReposList: {
          username,
          page,
          repos,
        },
      },
    }
  }

  return App
}
