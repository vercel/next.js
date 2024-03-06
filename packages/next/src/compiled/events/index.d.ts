// Type definitions for events 3.0
// Project: https://github.com/Gozala/events
// Definitions by: Yasunori Ohoka <https://github.com/yasupeke>
//                 Shenwei Wang <https://github.com/weareoutman>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

export type Listener = (...args: any[]) => void;

export class EventEmitter {
  static listenerCount(emitter: EventEmitter, type: string | number): number;
  static defaultMaxListeners: number;

  eventNames(): Array<string | number>;
  setMaxListeners(n: number): this;
  getMaxListeners(): number;
  emit(type: string | number, ...args: any[]): boolean;
  addListener(type: string | number, listener: Listener): this;
  on(type: string | number, listener: Listener): this;
  once(type: string | number, listener: Listener): this;
  prependListener(type: string | number, listener: Listener): this;
  prependOnceListener(type: string | number, listener: Listener): this;
  removeListener(type: string | number, listener: Listener): this;
  off(type: string | number, listener: Listener): this;
  removeAllListeners(type?: string | number): this;
  listeners(type: string | number): Listener[];
  listenerCount(type: string | number): number;
  rawListeners(type: string | number): Listener[];
}
