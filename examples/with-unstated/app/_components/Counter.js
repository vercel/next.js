"use client"
import { useCounter } from "../hooks/useCounter"; // import the custom hook

export default function Counter() {
  const { count, increment, decrement, reset } = useCounter(); 

  return (
    <div>
      <h1>
        Count: <span>{count}</span>
      </h1>
      <button onClick={() => decrement()}>-1</button>
      <button onClick={() => increment()}>+1</button>
      <button onClick={() => reset()}>Reset</button>
    </div>
  );
}
