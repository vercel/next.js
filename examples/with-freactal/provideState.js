import { provideState, update } from 'freactal'
import { fetchUserRepos } from './githubApi'

export default serverState =>
  provideState({
    initialState: () => ({
      ...serverState,
      ajaxStatus: false
    }),

    effects: {
      setAjaxLoader: update((state, ajaxStatus) => ({ ajaxStatus })),

      fetchGithubReposList: (effects, username, page) =>
        effects
          .setAjaxLoader(true)
          .then(() => fetchUserRepos(username, page))
          .then(repos => effects.setAjaxLoader(false).then(() => repos))
          .then(repos => state => ({
            ...state,
            githubReposList: {
              username,
              page,
              repos: state.githubReposList.repos.concat(repos)
            }
          }))
    }
  })
