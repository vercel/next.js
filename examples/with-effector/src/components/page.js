import { useEffect } from "react";
import { useEvent } from "effector-react/scope";
import { Navbar } from "./navbar";
import { Clock } from "./clock";
import { Counter } from "./counter";
import { startFx, stopTimer } from "../model";

export const Page = () => {
  const startEvent = useEvent(startFx);
  const stopTimerEvent = useEvent(stopTimer);

  useEffect(() => {
    startEvent();
    return () => stopTimerEvent();
  }, [startEvent, stopTimerEvent]);

  return (
    <>
      <Navbar />
      <Clock />
      <Counter />
    </>
  );
};
