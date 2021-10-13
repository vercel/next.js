import { useStore, useEvent } from "effector-react/scope";
import { $count, decrement, increment, reset } from "../model";

export const Counter = () => {
  const count = useStore($count);
  const [dec, inc, clear] = useEvent([decrement, increment, reset]);

  return (
    <div>
      <h1>Count: {count}</h1>
      <div>
        <button onClick={() => dec()}>- 1</button>
        <button onClick={() => inc()}>+ 1</button>
        <button onClick={() => clear()}>Reset</button>
      </div>
      <style jsx>{`
        button {
          cursor: pointer;
          margin: 0 0.25rem;
          padding: 0.25rem 1rem;
        }
      `}</style>
    </div>
  );
};
