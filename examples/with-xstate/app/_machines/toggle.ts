import { createMachine } from "xstate";

type ToggleContext = {
  value: "inactive" | "active";
};

type ToggleEvents = {
  type: "TOGGLE";
};

export const toggleMachine = createMachine({
  types: {} as {
    context: ToggleContext;
    events: ToggleEvents;
  },
  id: "toggle",
  initial: "inactive",
  states: {
    inactive: {
      on: { TOGGLE: "active" },
    },
    active: {
      on: { TOGGLE: "inactive" },
    },
  },
  context: {
    value: "inactive",
  },
});
