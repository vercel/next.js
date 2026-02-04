"use client";
import { useMachine } from "@xstate/react";
import { toggleMachine } from "../_machines/toggle";

export default function Toggle() {
  const [state, send] = useMachine(toggleMachine);
  return (
    <div>
      <h2>
        Toggle status: <span>{state.matches("active") ? "On" : "Off"}</span>
      </h2>
      <button onClick={() => send({ type: "TOGGLE" })}>Toggle</button>
    </div>
  );
}
