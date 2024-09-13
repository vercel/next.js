"use client";
import { useMachine } from "@xstate/react";
import { counterMachine } from "../_machines/counter";

export default function Counter({ counter = {} }) {
  const [state, send] = useMachine(counterMachine);
  return (
    <section>
      <h2>
        Count: <span>{state.context.count}</span>
      </h2>
      <button onClick={() => send({ type: "DEC" })}>-1</button>
      <button onClick={() => send({ type: "INC" })}>+1</button>
      <button onClick={() => send({ type: "RESET" })}>Reset</button>
    </section>
  );
}
