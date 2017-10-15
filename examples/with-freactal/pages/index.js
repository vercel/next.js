import React from 'react'
import { injectState } from 'freactal'
import app from '../components/app'

const Index = injectState(({ state: { ajaxStatus, githubReposList }, effects }) => {
  const fetchMore = () =>
    effects.fetchGithubReposList(githubReposList.username, githubReposList.page + 1)

  return (
    <div>
      <h1>{`List of @${githubReposList.username}'s repositories`}</h1>

      <table>
        <thead>
          <tr>
            <th>name</th>
            <th>watchers</th>
            <th>stars</th>
            <th>forks</th>
          </tr>
        </thead>
        <tbody>
          {githubReposList.repos.map((repo) => (
            <tr key={repo.id}>
              <td>{repo.name}</td>
              <td>{repo.watchers_count}</td>
              <td>{repo.stargazers_count}</td>
              <td>{repo.forks_count}</td>
            </tr>
          ))}
          <tr>
            <td>&nbsp;</td>
            <td colSpan='3'>
              <button
                onClick={fetchMore}
                disabled={ajaxStatus}
              >{ajaxStatus ? 'loading' : 'fetch more'}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
})

export default app(Index)
