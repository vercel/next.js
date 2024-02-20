import { useState, useEffect } from "react";
import { createContainer } from "unstated-next";

function useClock() {
  const [data, setData] = useState({ lastUpdate: 0, light: false });

  useEffect(() => {
    let interval = setInterval(() => {
      setData({ lastUpdate: Date.now(), light: !data.light });
    }, 1000);

    return () => clearInterval(interval);
  }, [data.light]);

  return data;
}

export default createContainer(useClock);
