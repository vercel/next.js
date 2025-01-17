import { createModel } from "@rematch/core";

const counter = createModel({
  state: 0, // initial state
  reducers: {
    // handle state changes with pure functions
    increment: (state, payload) => {
      if (typeof payload === "object") return state + 1;
      return state + payload;
    },
  },
  effects: {
    // handle state changes with impure functions.
    // use async/await for async actions
    async incrementAsync(payload, rootState) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      this.increment(payload);
    },
  },
});

export default counter;
