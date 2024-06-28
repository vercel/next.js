'use client';

import { useState } from 'react';

export default function ClientComponentExample() {
  const [count, setCount] = useState(0);
  const countUp = () => setCount(count + 1);

  return (
    <div className="flex flex-col items-center gap-y-4 border p-4">
      <h4>Client Component Example</h4>
      <p className="text-center text-xl font-bold">Count: {count}</p>
      <button className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700" onClick={countUp}>
        Count Up
      </button>
    </div>
  );
}
