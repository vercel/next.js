"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { useCount, useDispatchCount } from "@/_components/Counter";

export default function About() {
  const count = useCount();
  const dispatch = useDispatchCount();

  const handleIncrease = (event: MouseEvent<HTMLButtonElement>) =>
    dispatch({
      type: "INCREASE",
    });
  const handleIncrease15 = (event: MouseEvent<HTMLButtonElement>) =>
    dispatch({
      type: "INCREASE_BY",
      payload: 15,
    });

  return (
    <>
      <h1>ABOUT</h1>
      <p>Counter: {count}</p>
      <button onClick={handleIncrease}>Increase</button>
      <button onClick={handleIncrease15}>Increase By 15</button>
      <p>
        <Link href="/">Home</Link>
      </p>
    </>
  );
}
