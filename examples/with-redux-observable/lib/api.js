/**
 * Ajax actions that return Observables.
 * They are going to be used by Epics and in getInitialProps to fetch initial data.
 */

import { Observable } from "rxjs/Observable";
import { map, catchError } from "rxjs/operators";
import ajax from "universal-rx-request"; // because standard AjaxObservable only works in browser
import { fetchCharacterSuccess, fetchCharacterFailure } from "./reducer";

export const fetchCharacter = (id, isServer) =>
  ajax({ url: `https://swapi.co/api/people/${id}` }).pipe(
    map(response => fetchCharacterSuccess(response.body, isServer)),
    catchError(error =>
      Observable.of(fetchCharacterFailure(error.response.body, isServer))
    )
  );
