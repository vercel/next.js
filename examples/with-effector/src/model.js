import {
  createStore,
  createEvent,
  createEffect,
  scopeBind,
  sample,
} from "effector";
import { timeString } from "./lib";

export const increment = createEvent();
export const decrement = createEvent();
export const reset = createEvent();

export const $count = createStore(0)
  .on(decrement, (prevCount) => prevCount - 1)
  .on(increment, (prevCount) => prevCount + 1)
  .reset(reset);

export const $lastUpdate = createStore(0);
export const $light = createStore(false);
const $timerId = createStore(null);
export const $timeString = $lastUpdate.map(timeString);
export const update = createEvent();
export const toggleLight = createEvent();
export const stopTimer = createEvent();

export const startFx = createEffect(() => {
  const callUpdate = scopeBind(update);
  const callToggleLight = scopeBind(toggleLight);
  return setInterval(() => {
    callUpdate(Date.now());
    callToggleLight(true);
  }, 1000);
});

$lastUpdate.on(update, (_, newState) => newState);
$timerId.on(startFx.doneData, (_, timerId) => timerId);
$light.on(toggleLight, (_, newState) => newState);

sample({
  source: $timerId,
  clock: stopTimer,
  fn: clearInterval,
});
