import { createMachine, assign } from "xstate";

type CounterContext = {
  count: number;
};

type CounterEvents = {
  type: "INC" | "DEC" | "RESET";
};

export const counterMachine = createMachine<CounterContext, CounterEvents>({
  predictableActionArguments: true,
  initial: "active",
  context: {
    count: 0,
  },
  states: {
    active: {
      on: {
        INC: { actions: assign({ count: (context) => context.count + 1 }) },
        DEC: { actions: assign({ count: (context) => context.count - 1 }) },
        RESET: { actions: assign({ count: 0 }) },
      },
    },
  },
});
