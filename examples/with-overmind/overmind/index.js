import { rehydrate } from "overmind";
import { createHook } from "overmind-react";

export const config = {
  state: {
    page: null,
    items: [],
  },
  actions: {
    changePage({ state }, mutations) {
      rehydrate(state, mutations || []);

      switch (state.page) {
        case "Index":
          // Do some additional logic
          break;
        case "About":
          // Do some additional logic
          break;
        default:
          break;
      }
    },
  },
};

export const useOvermind = createHook();
