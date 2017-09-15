/* global fetch */
import 'isomorphic-fetch'

const API_BASE_URL = 'https://api.github.com'

export const fetchUserRepos = (username, page = 1) =>
  fetch(`${API_BASE_URL}/users/${username}/repos?page=${page}`)
    .then(response => response.json())
