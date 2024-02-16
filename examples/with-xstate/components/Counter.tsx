import { useMachine } from "@xstate/react";
import { counterMachine } from "../machines/counter";

export default function Counter({ counter = {} }) {
  const [current, send] = useMachine(counterMachine, {
    context: { count: 999 },
  });
  return (
    <section>
      <h2>
        Count: <span>{current.context.count}</span>
      </h2>
      <button onClick={() => send("DEC")}>-1</button>
      <button onClick={() => send("INC")}>+1</button>
      <button onClick={() => send("RESET")}>Reset</button>
    </section>
  );
}
