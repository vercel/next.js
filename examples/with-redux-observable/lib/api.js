/**
 * Ajax actions that return Observables.
 * They are going to be used by Epics and in getInitialProps to fetch initial data.
 */

import { map, catchError } from "rxjs/operators";
import { of } from "rxjs/observable/of"
import ajax from "universal-rx-request"; // because standard AjaxObservable only works in browser
import * as actions from "./actions";

export const fetchCharacter = (id, isServer) =>
  ajax({ url: `https://swapi.co/api/people/${id}` }).pipe(
    map(response => actions.fetchCharacterSuccess(response.body, isServer)),
    catchError(error =>
      of(actions.fetchCharacterFailure(error.response.body, isServer))
    )
  );
