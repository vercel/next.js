import { createMachine, assign } from "xstate";

type CounterContext = {
  count: number;
};

type CounterEvents = { type: "INC" } | { type: "DEC" } | { type: "RESET" };

export const counterMachine = createMachine({
  types: {} as {
    context: CounterContext;
    events: CounterEvents;
  },
  id: "counter",
  initial: "active",
  context: { count: 999 },
  states: {
    active: {
      on: {
        INC: { actions: assign({ count: ({ context }) => context.count + 1 }) },
        DEC: { actions: assign({ count: ({ context }) => context.count - 1 }) },
        RESET: { actions: assign({ count: 0 }) },
      },
    },
  },
});
