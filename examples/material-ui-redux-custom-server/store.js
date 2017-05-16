import { createStore, applyMiddleware } from 'redux';
import { composeWithDevTools } from 'redux-devtools-extension';
import clientMiddleware from '@/middlewares/clientMiddleware';
import request from '@/utils/request';
import reducer from '@/reducer';

const composeEnhancers = composeWithDevTools({
  // Specify here name, actionsBlacklist, actionsCreators and other options if needed
});

export const initStore = (initialState) => {
  const store = createStore(reducer,
    initialState,
    composeEnhancers(
      applyMiddleware(clientMiddleware(request))
    ));
  return store;
};
