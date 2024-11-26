"use client";

import { useState, useEffect } from "react";

export function useClock() {
  const [data, setData] = useState({ lastUpdate: 0, light: false });

  useEffect(() => {
    const interval = setInterval(() => {
      setData({ lastUpdate: Date.now(), light: !data.light });
    }, 1000);

    return () => clearInterval(interval);
  }, [data.light]);

  return data;
}
