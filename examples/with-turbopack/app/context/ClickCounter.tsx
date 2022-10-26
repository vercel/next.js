'use client';

import { useCounter } from './CounterContext';
import React from 'react';
import { Boundary } from '@/ui/Boundary';

const ClickCounter = () => {
  const [count, setCount] = useCounter();

  return (
    <Boundary
      labels={['Counter Context [Client Component]']}
      color="blue"
      size="small"
      animateRerendering={false}
    >
      <button
        onClick={() => setCount(count + 1)}
        className="rounded-lg bg-zinc-700 px-3 py-1 text-sm font-medium tabular-nums text-zinc-100 hover:bg-zinc-500 hover:text-white"
      >
        {count} Clicks
      </button>
    </Boundary>
  );
};

export const Counter = () => {
  const [count] = useCounter();

  return (
    <Boundary
      labels={['Counter Context [Client Component]']}
      color="blue"
      size="small"
      animateRerendering={false}
    >
      <div className="span text-xl font-bold text-white">
        <span className="tabular-nums">{count}</span> Clicks
      </div>
    </Boundary>
  );
};

export default ClickCounter;
