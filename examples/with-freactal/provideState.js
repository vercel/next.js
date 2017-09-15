import { provideState } from 'freactal'
import { fetchUserRepos } from './githubApi'

export default initialState => provideState({
  initialState: () => initialState,
  effects: {
    fetchGithubReposList: (effects, username, page) => fetchUserRepos(username, page)
      .then((repos) => (state) => ({
        ...state,
        githubReposList: {
          username,
          page,
          repos: state.githubReposList.repos.concat(repos)
        }
      }))
  }
})
