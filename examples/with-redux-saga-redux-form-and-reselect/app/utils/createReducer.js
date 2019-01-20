import { combineReducers } from 'redux';
import { reducer as reduxFormReducer } from 'redux-form';

import globalReducer from '../reducer';

export default function createReducer(asyncReducers) {
    return combineReducers({
        global: globalReducer,
        form: reduxFormReducer,
        ...asyncReducers,
    });
}
