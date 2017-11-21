// we bundle only what is necessary from rxjs library
import 'rxjs/add/operator/mergeMap'
import 'rxjs/add/operator/map'
import 'rxjs/add/operator/delay'
import 'rxjs/add/operator/takeUntil'
import { Observable } from 'rxjs/Observable'
import 'rxjs/add/observable/interval'
import ajax from 'universal-rx-request' // because standard AjaxObservable only works in browser

export {
  Observable,
  ajax
}
