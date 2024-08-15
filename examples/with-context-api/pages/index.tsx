import type { MouseEvent } from "react";
import Link from "next/link";
import { useCount, useDispatchCount } from "../components/Counter";

const IndexPage = () => {
  const count = useCount();
  const dispatch = useDispatchCount();

  const handleIncrease = (event: MouseEvent<HTMLButtonElement>) =>
    dispatch({
      type: "INCREASE",
    });
  const handleDecrease = (event: MouseEvent<HTMLButtonElement>) =>
    dispatch({
      type: "DECREASE",
    });

  return (
    <>
      <h1>HOME</h1>
      <p>Counter: {count}</p>
      <button onClick={handleIncrease}>Increase</button>
      <button onClick={handleDecrease}>Decrease</button>
      <p>
        <Link href="/about">About</Link>
      </p>
    </>
  );
};

export default IndexPage;
