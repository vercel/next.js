"use client";

import { useEffect, useState } from "react";

type CacheStateWatcherProps = { time: number; revalidateAfter: number };

export function CacheStateWatcher({
  time,
  revalidateAfter,
}: CacheStateWatcherProps): JSX.Element {
  const [cacheState, setCacheState] = useState("");
  const [countDown, setCountDown] = useState("");

  useEffect(() => {
    let id = -1;

    function check(): void {
      const now = Date.now();

      setCountDown(
        Math.max(0, (time + revalidateAfter - now) / 1000).toFixed(3),
      );

      if (now > time + revalidateAfter) {
        setCacheState("stale");

        return;
      }

      setCacheState("fresh");

      id = requestAnimationFrame(check);
    }

    id = requestAnimationFrame(check);

    return () => {
      cancelAnimationFrame(id);
    };
  }, [revalidateAfter, time]);

  return (
    <>
      <div className={`cache-state ${cacheState}`}>
        Cache state: {cacheState}
      </div>
      <div className="stale-after">Stale in: {countDown}</div>
    </>
  );
}
