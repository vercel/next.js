type TickMode = "nextAsync" | "manual" | "interval";
type VoidVarArgsFunc = (...args: unknown[]) => void;
type NextTick = (callback: VoidVarArgsFunc, ...args: unknown[]) => void;
type SetImmediate = (callback: VoidVarArgsFunc, ...args: unknown[]) => NodeImmediate;
type SetTimeout = (callback: VoidVarArgsFunc, delay?: number, ...args: unknown[]) => TimerId;
type ClearTimeout = (id?: TimerId) => void;
type SetInterval = (callback: VoidVarArgsFunc, delay?: number, ...args: unknown[]) => TimerId;
type ClearInterval = (id?: TimerId) => void;
type QueueMicrotask = (callback: VoidVarArgsFunc) => void;
type TimeRemaining = () => number;
type IdleDeadline = {
    didTimeout: boolean;
    timeRemaining: TimeRemaining;
};
type RequestIdleCallbackCallback = (deadline: IdleDeadline) => any;
type RequestIdleCallback = (callback: RequestIdleCallbackCallback, options?: {
    timeout?: number;
}) => number;
type AnimationFrameCallback = (timestamp: number) => any;
type RequestAnimationFrame = (callback: AnimationFrameCallback) => TimerId;
type CancelAnimationFrame = (id: TimerId) => void;
type CancelIdleCallback = (id: TimerId) => void;
type ClearImmediate = (id: NodeImmediate) => void;
type CountTimers = () => number;
type RunMicrotasks = () => void;
type TemporalDuration = {
    years: number;
    months: number;
    weeks: number;
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    milliseconds: number;
    microseconds: number;
    nanoseconds: number;
    total: (options: {
        unit: string;
        relativeTo?: unknown;
    }) => number;
};
type TemporalTimelike = {
    epochMilliseconds: number;
};
type Tick = (tickValue: number | string | TemporalDuration) => number;
type TickAsync = (tickValue: number | string | TemporalDuration) => Promise<number>;
type Next = () => number;
type NextAsync = () => Promise<number>;
type RunAll = () => number;
type RunToFrame = () => number;
type RunAllAsync = () => Promise<number>;
type RunToLast = () => number;
type RunToLastAsync = () => Promise<number>;
type Reset = () => void;
type SetSystemTime = (now?: number | Date | TemporalTimelike) => void;
type Jump = (tickValue: number | string | TemporalDuration) => number;
type Uninstall = () => void;
type SetTickMode = (tickModeConfig: SetTickModeConfig) => void;
type Hrtime = (prev?: Array<number>) => Array<number>;
type WithGlobal = (_global: object) => FakeTimers;
type FakeMethod = "setTimeout" | "clearTimeout" | "setImmediate" | "clearImmediate" | "setInterval" | "clearInterval" | "Date" | "nextTick" | "hrtime" | "requestAnimationFrame" | "cancelAnimationFrame" | "requestIdleCallback" | "cancelIdleCallback" | "performance" | "queueMicrotask" | "Intl" | "Temporal";
type TimerId = number | NodeImmediate | Timer;
type GlobalObject = Record<string, any> & {
    setTimeout?: SetTimeout;
    clearTimeout?: ClearTimeout;
    setInterval?: SetInterval;
    clearInterval?: ClearInterval;
    setImmediate?: SetImmediate;
    clearImmediate?: ClearImmediate;
    queueMicrotask?: QueueMicrotask;
    requestAnimationFrame?: RequestAnimationFrame;
    cancelAnimationFrame?: CancelAnimationFrame;
    requestIdleCallback?: RequestIdleCallback;
    cancelIdleCallback?: CancelIdleCallback;
    process?: any;
    performance?: any;
    Performance?: any;
    Intl?: any;
    Temporal?: any;
    Promise?: typeof Promise;
    Date: typeof Date & {
        isFake?: boolean;
        toSource?: () => string;
        clock?: any;
    };
};
type TimerHeap = {
    timers: Timer[];
    peek: () => Timer | undefined;
    push: (timer: Timer) => void;
    pop: () => Timer | undefined;
    remove: (timer: Timer) => void;
};
type ClockTickMode = {
    mode: TickMode;
    counter: number;
    delta?: number;
};
type SetTickModeConfig = {
    mode: TickMode;
    delta?: number;
};
type IntlWithClock = Record<string, any> & {
    clock: Clock;
};
type PerformanceLike = Record<string, any> & {
    now: () => number;
};
type Timers = {
    setTimeout: SetTimeout;
    clearTimeout: ClearTimeout;
    setInterval: SetInterval;
    clearInterval: ClearInterval;
    Date: typeof Date;
    Intl?: typeof Intl;
    Temporal?: any;
    setImmediate?: SetImmediate;
    clearImmediate?: ClearImmediate;
    hrtime?: Hrtime;
    nextTick?: NextTick;
    performance?: PerformanceLike;
    requestAnimationFrame?: RequestAnimationFrame;
    queueMicrotask?: QueueMicrotask;
    cancelAnimationFrame?: CancelAnimationFrame;
    requestIdleCallback?: RequestIdleCallback;
    cancelIdleCallback?: CancelIdleCallback;
};
type TimerInitialProps = {
    func: VoidVarArgsFunc;
    args?: unknown[];
    type?: 'Timeout' | 'Interval' | 'Immediate' | 'AnimationFrame' | 'IdleCallback';
    delay?: number;
    callAt?: number;
    createdAt?: number;
    immediate?: boolean;
    id?: number;
    error?: Error;
    interval?: number;
    animation?: boolean;
    requestIdleCallback?: boolean;
    order?: number;
    heapIndex?: number;
};
type CreateClockCallback = (start?: number | Date | TemporalTimelike, loopLimit?: number) => Clock;
type InstallCallback = (config?: Config) => Clock;
type FakeTimers = {
    timers: Timers;
    createClock: CreateClockCallback;
    install: InstallCallback;
    withGlobal: WithGlobal;
};
type Clock = {
    now: number;
    Date: typeof Date & {
        clock?: Clock;
        isFake?: boolean;
        toSource?: () => string;
    };
    loopLimit: number;
    requestIdleCallback: RequestIdleCallback;
    cancelIdleCallback: CancelIdleCallback;
    setTimeout: SetTimeout;
    clearTimeout: ClearTimeout;
    nextTick: NextTick;
    queueMicrotask: QueueMicrotask;
    setInterval: SetInterval;
    clearInterval: ClearInterval;
    setImmediate: SetImmediate;
    clearImmediate: ClearImmediate;
    countTimers: CountTimers;
    requestAnimationFrame: RequestAnimationFrame;
    cancelAnimationFrame: CancelAnimationFrame;
    runMicrotasks: RunMicrotasks;
    tick: Tick;
    tickAsync: TickAsync;
    next: Next;
    nextAsync: NextAsync;
    runAll: RunAll;
    runToFrame: RunToFrame;
    runAllAsync: RunAllAsync;
    runToLast: RunToLast;
    runToLastAsync: RunToLastAsync;
    reset: Reset;
    setSystemTime: SetSystemTime;
    jump: Jump;
    performance: any;
    hrtime: Hrtime;
    uninstall: Uninstall;
    methods: string[];
    shouldClearNativeTimers?: boolean;
    timersModuleMethods: {
        methodName: string;
        original: unknown;
    }[] | undefined;
    timersPromisesModuleMethods: {
        methodName: string;
        original: unknown;
    }[] | undefined;
    abortListenerMap: Map<VoidVarArgsFunc, AbortSignal>;
    setTickMode: SetTickMode;
    timers?: Map<number, Timer>;
    timerHeap?: TimerHeap;
    duringTick?: boolean;
    isNearInfiniteLimit: boolean;
    attachedInterval?: TimerId;
    tickMode?: ClockTickMode;
    jobs?: Timer[];
    Intl?: IntlWithClock;
    Temporal?: any;
};
type Config = {
    now?: number | Date | TemporalTimelike;
    toFake?: FakeMethod[];
    toNotFake?: FakeMethod[];
    loopLimit?: number;
    shouldAdvanceTime?: boolean;
    advanceTimeDelta?: number;
    shouldClearNativeTimers?: boolean;
    ignoreMissingTimers?: boolean;
    target?: GlobalObject;
};
type Timer = TimerInitialProps;
type NodeImmediateHasRef = () => boolean;
type NodeImmediateRef = () => NodeImmediate;
type NodeImmediateUnref = () => NodeImmediate;
type NodeImmediate = {
    hasRef: NodeImmediateHasRef;
    ref: NodeImmediateRef;
    unref: NodeImmediateUnref;
};

type FakeTimerMethod = FakeMethod | 'Temporal'
interface FakeTimerConfig extends Omit<Config, 'toFake'> {
  toFake?: FakeTimerMethod[]
  toNotFake?: FakeTimerMethod[]
  shouldClearNativeTimers?: boolean
  ignoreMissingTimers?: boolean
}
interface TimerClock extends Clock {
  setTickMode(mode: {
    mode: 'manual' | 'nextAsync' | 'interval'
    delta?: number
  }): void
}
interface TimerContext extends Omit<FakeTimers, 'install' | 'timers'> {
  timers: Record<string, unknown>
  install(config?: FakeTimerConfig): TimerClock
}
declare function createTimerContext(
  global: typeof globalThis,
  bridge: { timers: unknown; timersPromises: unknown; util: unknown }
): TimerContext

export { createTimerContext };
export type { FakeTimerConfig, FakeTimerMethod, TimerClock, TimerContext };
