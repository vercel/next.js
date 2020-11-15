import { Machine, assign } from "xstate";

const flowMachine = Machine({
  id: "flow",
  initial: "start",
  context: {
    someId: -Infinity,
    someInfo: '',
  },
  states: {
    start: {
      on: {
        STEP1: {
          target: "step1",
          actions: assign({
            someId: (context, event) => {
              return event.someId;
            }
          })
        }
      }
    },
    step1: {
      on: {
        START: {
          target: "start",
          actions: assign({
            someId: (context, event) => {
              return -Infinity;
            },
            someInfo: (context, event) => {
              return '';
            }
          })
        },
        STEP2: {
          target: "step2",
          actions: assign({
            someId: (context, event) => {
              return event.someId;
            },
            someInfo: (context, event) => {
              return event.someInfo;
            }
          })
        }
      }
    },
    step2: {
      on: {
        START: {
          target: "start",
          actions: assign({
            someId: (context, event) => {
              return -Infinity;
            },
            someInfo: (context, event) => {
              return '';
            }
          })
        }
      }
    }
  }
});

export default flowMachine;
