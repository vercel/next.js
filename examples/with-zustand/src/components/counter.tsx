"use client";

import { useStore } from "../lib/store";
import { useShallow } from "zustand/react/shallow";

function useCounter() {
  return useStore(
    useShallow((store) => ({
      count: store.count,
      increment: store.increment,
      decrement: store.decrement,
      reset: store.reset,
    })),
  );
}

function Counter() {
  const { count, increment, decrement, reset } = useCounter();
  return (
    <div>
      <h1>
        Count: <span>{count}</span>
      </h1>
      <button onClick={increment}>+1</button>
      <button onClick={decrement}>-1</button>
      <button onClick={reset}>Reset</button>
    </div>
  );
}

export default Counter;
