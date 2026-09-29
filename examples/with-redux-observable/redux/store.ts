import { createStore, applyMiddleware } from "redux";
import { createEpicMiddleware } from "redux-observable";
import reducer, { CharacterState } from "./reducer";
import { rootEpic } from "./epics";

export const initializeStore = (preloadedState?: Partial<CharacterState>) => {
  const epicMiddleware = createEpicMiddleware();

  const store = createStore(
    reducer,
    preloadedState as any,
    applyMiddleware(epicMiddleware)
  );

  epicMiddleware.run(rootEpic);

  return store;
};
