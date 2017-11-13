/**
 * Ajax actions that return Observables.
 * They are going to be used by Epics and in getInitialProps to fetch initial data.
 */

import { ajax, Observable } from './rxjs-library'
import { fetchCharacterSuccess, fetchCharacterFailure } from './reducer'

export const fetchCharacter = (id, isServer) =>
  ajax({ url: `https://swapi.co/api/people/${id}` })
    .map(response => fetchCharacterSuccess(response.body, isServer))
    .catch(error => Observable.of(fetchCharacterFailure(error.response.body, isServer)))
