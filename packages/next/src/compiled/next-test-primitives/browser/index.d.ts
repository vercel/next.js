import * as chai from '../chai';
export { chai };

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
type InstallCallback = (config?: Config$2) => Clock;
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
type Config$2 = {
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
interface FakeTimerConfig extends Omit<Config$2, 'toFake'> {
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

/* oxlint-disable typescript/ban-ts-comment */

interface Disposable {
  // @ts-ignore -- Symbol.dispose might not be in user types
  [Symbol.dispose]: () => void
}

interface MockResultReturn<T> {
	type: "return";
	/**
	* The value that was returned from the function. If the function returned a Promise, then this will be the Promise, not its resolved value.
	*/
	value: T;
}
interface MockResultIncomplete {
	type: "incomplete";
	value: undefined;
}
interface MockResultThrow {
	type: "throw";
	/**
	* An error that was thrown during function execution.
	*/
	value: any;
}
interface MockSettledResultIncomplete {
	type: "incomplete";
	value: undefined;
}
interface MockSettledResultFulfilled<T> {
	type: "fulfilled";
	value: T;
}
interface MockSettledResultRejected {
	type: "rejected";
	value: any;
}
type MockResult<T> = MockResultReturn<T> | MockResultThrow | MockResultIncomplete;
type MockSettledResult<T> = MockSettledResultFulfilled<T> | MockSettledResultRejected | MockSettledResultIncomplete;
type MockParameters<T extends Procedure | Constructable> = T extends Constructable ? ConstructorParameters<T> : T extends Procedure ? Parameters<T> : never;
type MockReturnType<T extends Procedure | Constructable> = T extends Constructable ? InstanceType<T> : T extends Procedure ? ReturnType<T> : never;
type MockProcedureContext<T extends Procedure | Constructable> = T extends Constructable ? InstanceType<T> : ThisParameterType<T>;
interface MockContext<T extends Procedure | Constructable = Procedure> {
	/**
	* This is an array containing all arguments for each call. One item of the array is the arguments of that call.
	*
	* @see https://vitest.dev/api/mock#mock-calls
	* @example
	* const fn = vi.fn()
	*
	* fn('arg1', 'arg2')
	* fn('arg3')
	*
	* fn.mock.calls === [
	*   ['arg1', 'arg2'], // first call
	*   ['arg3'], // second call
	* ]
	*/
	calls: MockParameters<T>[];
	/**
	* An array with one value for each call: the object returned by `new`, or the context (`this`) of the call if the mock was called without `new`.
	* @see https://vitest.dev/api/mock#mock-instances
	*/
	instances: MockProcedureContext<T>[];
	/**
	* An array of `this` values that were used during each call to the mock function. If the mock was called with `new`, the value is the same as in `instances`.
	* @see https://vitest.dev/api/mock#mock-contexts
	*/
	contexts: MockProcedureContext<T>[];
	/**
	* The order of mock's execution. This returns an array of numbers which are shared between all defined mocks.
	*
	* @see https://vitest.dev/api/mock#mock-invocationcallorder
	* @example
	* const fn1 = vi.fn()
	* const fn2 = vi.fn()
	*
	* fn1()
	* fn2()
	* fn1()
	*
	* fn1.mock.invocationCallOrder === [1, 3]
	* fn2.mock.invocationCallOrder === [2]
	*/
	invocationCallOrder: number[];
	/**
	* This is an array containing all values that were `returned` from the function.
	*
	* The `value` property contains the returned value or thrown error. If the function returned a `Promise`, then `result` will always be `'return'` even if the promise was rejected.
	*
	* @see https://vitest.dev/api/mock#mock-results
	* @example
	* const fn = vi.fn()
	*   .mockReturnValueOnce('result')
	*   .mockImplementationOnce(() => { throw new Error('thrown error') })
	*
	* const result = fn()
	*
	* try {
	*   fn()
	* }
	* catch {}
	*
	* fn.mock.results === [
	*   {
	*     type: 'return',
	*     value: 'result',
	*   },
	*   {
	*     type: 'throw',
	*     value: Error,
	*   },
	* ]
	*/
	results: MockResult<MockReturnType<T>>[];
	/**
	* An array containing all values that were `resolved` or `rejected` from the function.
	*
	* Until the value is resolved or rejected, the type will be `incomplete`.
	*
	* @see https://vitest.dev/api/mock#mock-settledresults
	* @example
	* const fn = vi.fn().mockResolvedValueOnce('result')
	*
	* const result = fn()
	*
	* fn.mock.settledResults === [
	*   {
	*     type: 'incomplete',
	*     value: undefined,
	*   }
	* ]
	* fn.mock.results === [
	*   {
	*     type: 'return',
	*     value: Promise<'result'>,
	*   },
	* ]
	*
	* await result
	*
	* fn.mock.settledResults === [
	*   {
	*     type: 'fulfilled',
	*     value: 'result',
	*   },
	* ]
	*/
	settledResults: MockSettledResult<Awaited<MockReturnType<T>>>[];
	/**
	* This contains the arguments of the last call. If spy wasn't called, will return `undefined`.
	* @see https://vitest.dev/api/mock#mock-lastcall
	*/
	lastCall: MockParameters<T> | undefined;
}
type Procedure = (...args: any[]) => any;
type NormalizedProcedure<T extends Procedure | Constructable> = T extends Constructable ? {
	new (...args: ConstructorParameters<T>): InstanceType<T>;
} | {
	(this: InstanceType<T>, ...args: ConstructorParameters<T>): void;
} : T extends Procedure ? (...args: Parameters<T>) => ReturnType<T> : never;
type Methods<T> = keyof { [K in keyof T as T[K] extends Procedure ? K : never]: T[K] };
type Properties<T> = { [K in keyof T]: T[K] extends Procedure ? never : K }[keyof T] & (string | symbol);
type Classes<T> = { [K in keyof T]: T[K] extends new (...args: any[]) => any ? K : never }[keyof T] & (string | symbol);
interface MockInstance<T extends Procedure | Constructable = Procedure> extends Disposable {
	/**
	* Use it to return the name assigned to the mock with the `.mockName(name)` method. By default, it will return `vi.fn()`.
	* @see https://vitest.dev/api/mock#getmockname
	*/
	getMockName(): string;
	/**
	* Sets the internal mock name. This is useful for identifying the mock when an assertion fails.
	* @see https://vitest.dev/api/mock#mockname
	*/
	mockName(name: string): this;
	/**
	* Current context of the mock. It stores information about all invocation calls, instances, and results.
	*/
	mock: MockContext<T>;
	/**
	* Clears all information about every call. After calling it, all properties on `.mock` will return to their initial state. This method does not reset implementations. It is useful for cleaning up mocks between different assertions.
	*
	* To automatically call this method before each test, enable the [`clearMocks`](https://vitest.dev/config/clearmocks) setting in the configuration.
	* @see https://vitest.dev/api/mock#mockclear
	*/
	mockClear(): this;
	/**
	* Does what `mockClear` does and resets inner implementation to the original function. This also resets all "once" implementations.
	*
	* Note that resetting a mock from `vi.fn()` will set implementation to an empty function that returns `undefined`.
	* Resetting a mock from `vi.fn(impl)` will set implementation to `impl`. It is useful for completely resetting a mock to its default state.
	*
	* To automatically call this method before each test, enable the [`mockReset`](https://vitest.dev/config/mockreset) setting in the configuration.
	* @see https://vitest.dev/api/mock#mockreset
	*/
	mockReset(): this;
	/**
	* Does what `mockReset` does and restores original descriptors of spied-on objects.
	* @see https://vitest.dev/api/mock#mockrestore
	*/
	mockRestore(): void;
	/**
	* Returns current mock implementation if there is one. If an implementation was queued with `mockImplementationOnce`, it returns the first queued implementation instead.
	*
	* If mock was created with `vi.fn`, it will consider passed down method as a mock implementation.
	*
	* If mock was created with `vi.spyOn`, it will return `undefined` unless a custom implementation was provided.
	*/
	getMockImplementation(): NormalizedProcedure<T> | undefined;
	/**
	* Accepts a function to be used as the mock implementation. TypeScript expects the arguments and return type to match those of the original function.
	* @see https://vitest.dev/api/mock#mockimplementation
	* @example
	* const increment = vi.fn().mockImplementation(count => count + 1);
	* expect(increment(3)).toBe(4);
	*/
	mockImplementation(fn: NormalizedProcedure<T>): this;
	/**
	* Accepts a function to be used as the mock implementation. TypeScript expects the arguments and return type to match those of the original function. This method can be chained to produce different results for multiple function calls.
	*
	* When the mocked function runs out of implementations, it will invoke the default implementation set with `vi.fn(() => defaultValue)` or `.mockImplementation(() => defaultValue)` if they were called.
	* @see https://vitest.dev/api/mock#mockimplementationonce
	* @example
	* const fn = vi.fn(count => count).mockImplementationOnce(count => count + 1);
	* expect(fn(3)).toBe(4);
	* expect(fn(3)).toBe(3);
	*/
	mockImplementationOnce(fn: NormalizedProcedure<T>): this;
	/**
	* Overrides the original mock implementation temporarily while the callback is being executed.
	*
	* Note that this method takes precedence over the [`mockImplementationOnce`](https://vitest.dev/api/mock#mockimplementationonce).
	* @see https://vitest.dev/api/mock#withimplementation
	* @example
	* const myMockFn = vi.fn(() => 'original')
	*
	* myMockFn.withImplementation(() => 'temp', () => {
	*   myMockFn() // 'temp'
	* })
	*
	* myMockFn() // 'original'
	*/
	withImplementation(fn: NormalizedProcedure<T>, cb: () => Promise<unknown>): Promise<this>;
	withImplementation(fn: NormalizedProcedure<T>, cb: () => unknown): this;
	/**
	* Use this if you need to return the `this` context from the method without invoking the actual implementation.
	* @see https://vitest.dev/api/mock#mockreturnthis
	*/
	mockReturnThis(): this;
	/**
	* Accepts a value that will be returned whenever the mock function is called. TypeScript will only accept values that match the return type of the original function.
	* @see https://vitest.dev/api/mock#mockreturnvalue
	* @example
	* const mock = vi.fn()
	* mock.mockReturnValue(42)
	* mock() // 42
	* mock.mockReturnValue(43)
	* mock() // 43
	*/
	mockReturnValue(value: MockReturnType<T>): this;
	/**
	* Accepts a value that will be returned during the next function call. TypeScript will only accept values that match the return type of the original function. If chained, each consecutive call will return the specified value.
	*
	* When the mocked function runs out of implementations, it will invoke the default implementation set with `vi.fn(() => defaultValue)` or `.mockImplementation(() => defaultValue)` if they were called.
	* @example
	* const myMockFn = vi
	*   .fn()
	*   .mockReturnValue('default')
	*   .mockReturnValueOnce('first call')
	*   .mockReturnValueOnce('second call')
	*
	* // 'first call', 'second call', 'default'
	* console.log(myMockFn(), myMockFn(), myMockFn())
	*/
	mockReturnValueOnce(value: MockReturnType<T>): this;
	/**
	* Accepts a value that will be thrown whenever the mock function is called.
	* @see https://vitest.dev/api/mock#mockthrow
	* @example
	* const myMockFn = vi.fn().mockThrow(new Error('error'))
	* myMockFn() // throws 'error'
	*/
	mockThrow(value: unknown): this;
	/**
	* Accepts a value that will be thrown during the next function call. If chained, every consecutive call will throw the specified value.
	* @example
	* const myMockFn = vi
	*   .fn()
	*   .mockReturnValue('default')
	*   .mockThrowOnce(new Error('first call error'))
	*   .mockThrowOnce('second call error')
	*
	* expect(() => myMockFn()).toThrowError('first call error')
	* expect(() => myMockFn()).toThrowError('second call error')
	* expect(myMockFn()).toEqual('default')
	*/
	mockThrowOnce(value: unknown): this;
	/**
	* Accepts a value that will be resolved when the async function is called. TypeScript will only accept values that match the return type of the original function.
	* @example
	* const asyncMock = vi.fn().mockResolvedValue(42)
	* asyncMock() // Promise<42>
	*/
	mockResolvedValue(value: Awaited<MockReturnType<T>>): this;
	/**
	* Accepts a value that will be resolved during the next function call. TypeScript will only accept values that match the return type of the original function. If chained, each consecutive call will resolve the specified value.
	* @example
	* const myMockFn = vi
	*   .fn()
	*   .mockResolvedValue('default')
	*   .mockResolvedValueOnce('first call')
	*   .mockResolvedValueOnce('second call')
	*
	* // Promise<'first call'>, Promise<'second call'>, Promise<'default'>
	* console.log(myMockFn(), myMockFn(), myMockFn())
	*/
	mockResolvedValueOnce(value: Awaited<MockReturnType<T>>): this;
	/**
	* Accepts an error that will be rejected when async function is called.
	* @example
	* const asyncMock = vi.fn().mockRejectedValue(new Error('Async error'))
	* await asyncMock() // throws Error<'Async error'>
	*/
	mockRejectedValue(error: unknown): this;
	/**
	* Accepts a value that will be rejected during the next function call. If chained, each consecutive call will reject the specified value.
	* @example
	* const asyncMock = vi
	*   .fn()
	*   .mockResolvedValueOnce('first call')
	*   .mockRejectedValueOnce(new Error('Async error'))
	*
	* await asyncMock() // first call
	* await asyncMock() // throws Error<'Async error'>
	*/
	mockRejectedValueOnce(error: unknown): this;
}
type Mock<T extends Procedure | Constructable = Procedure> = MockInstance<T> & (T extends Constructable ? T extends Procedure ? {
	new (...args: ConstructorParameters<T>): InstanceType<T>;
	(...args: Parameters<T>): ReturnType<T>;
} : {
	new (...args: ConstructorParameters<T>): InstanceType<T>;
} : {
	new (...args: MockParameters<T>): MockReturnType<T>;
	(...args: MockParameters<T>): MockReturnType<T>;
}) & { [P in keyof T]: T[P] };
type PartialMaybePromise<T> = T extends Promise<Awaited<T>> ? Promise<Partial<Awaited<T>>> : Partial<T>;
type PartialResultFunction<T> = T extends Constructable ? {
	new (...args: ConstructorParameters<T>): InstanceType<T>;
} | {
	(this: InstanceType<T>, ...args: ConstructorParameters<T>): void;
} : T extends Procedure ? (...args: Parameters<T>) => PartialMaybePromise<ReturnType<T>> : T;
type PartialMock<T extends Procedure | Constructable = Procedure> = Mock<PartialResultFunction<T extends Mock ? NonNullable<ReturnType<T["getMockImplementation"]>> : T>>;
type DeepPartial<T> = T extends Procedure ? T : T extends Array<infer U> ? Array<DeepPartial<U>> : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
type DeepPartialMaybePromise<T> = T extends Promise<Awaited<T>> ? Promise<DeepPartial<Awaited<T>>> : DeepPartial<T>;
type DeepPartialResultFunction<T> = T extends Constructable ? {
	new (...args: ConstructorParameters<T>): InstanceType<T>;
} | {
	(this: InstanceType<T>, ...args: ConstructorParameters<T>): void;
} : T extends Procedure ? (...args: Parameters<T>) => DeepPartialMaybePromise<ReturnType<T>> : T;
type DeepPartialMock<T extends Procedure | Constructable = Procedure> = Mock<DeepPartialResultFunction<T extends Mock ? NonNullable<ReturnType<T["getMockImplementation"]>> : T>>;
type MaybeMockedConstructor<T> = T extends Constructable ? Mock<T> : T;
type MockedFunction<T extends Procedure | Constructable> = Mock<T> & MockedObject<T>;
type PartiallyMockedFunction<T extends Procedure | Constructable> = PartialMock<T> & MockedObject<T>;
type MockedFunctionDeep<T extends Procedure | Constructable> = Mock<T> & MockedObjectDeep<T>;
type PartiallyMockedFunctionDeep<T extends Procedure | Constructable> = DeepPartialMock<T> & MockedObjectDeep<T>;
type MockedObject<T> = MaybeMockedConstructor<T> & { [K in Methods<T>]: T[K] extends Procedure ? MockedFunction<T[K]> : T[K] } & { [K in Properties<T>]: T[K] };
type MockedObjectDeep<T> = MaybeMockedConstructor<T> & { [K in Methods<T>]: T[K] extends Procedure ? MockedFunctionDeep<T[K]> : T[K] } & { [K in Properties<T>]: MaybeMockedDeep<T[K]> };
type MaybeMockedDeep<T> = T extends Procedure | Constructable ? MockedFunctionDeep<T> : T extends object ? MockedObjectDeep<T> : T;
type MaybePartiallyMockedDeep<T> = T extends Procedure | Constructable ? PartiallyMockedFunctionDeep<T> : T extends object ? MockedObjectDeep<T> : T;
type MaybeMocked<T> = T extends Procedure | Constructable ? MockedFunction<T> : T extends object ? MockedObject<T> : T;
type MaybePartiallyMocked<T> = T extends Procedure | Constructable ? PartiallyMockedFunction<T> : T extends object ? MockedObject<T> : T;
interface Constructable {
	new (...args: any[]): any;
}
type MockedClass<T extends Constructable> = MockInstance<T> & {
	prototype: T extends {
		prototype: any;
	} ? Mocked<T["prototype"]> : never;
} & T;
type Mocked<T> = { [P in keyof T]: T[P] extends Procedure ? MockInstance<T[P]> : T[P] extends Constructable ? MockedClass<T[P]> : T[P] } & T;
interface MockConfig {
	mockImplementation: Procedure | Constructable | undefined;
	mockOriginal: Procedure | Constructable | undefined;
	mockName: string;
	onceMockImplementations: Array<Procedure | Constructable>;
}
interface MockInstanceOption {
	originalImplementation?: Procedure | Constructable;
	mockImplementation?: Procedure | Constructable;
	resetToMockImplementation?: boolean;
	restore?: () => void;
	prototypeMembers?: (string | symbol)[];
	keepMembersImplementation?: boolean;
	prototypeState?: MockContext;
	prototypeConfig?: MockConfig;
	resetToMockName?: boolean;
	name?: string | symbol;
}

declare function isMockFunction(fn: any): fn is Mock;
declare function createMockInstance(options?: MockInstanceOption): Mock<Procedure | Constructable>;
declare function fn<T extends Procedure | Constructable = Procedure>(originalImplementation?: T): Mock<T>;
type SpyOnValue<
	T extends object,
	K extends keyof any
> = K extends keyof Required<T> ? Required<T>[K] : (T & Record<K, unknown>)[K];
type SpyOnMethod<
	T extends object,
	K extends keyof any
> = SpyOnValue<T, K> extends Constructable | Procedure ? SpyOnValue<T, K> : never;
type SpyOnMethodKey<
	T extends object,
	K extends keyof any
> = SpyOnValue<T, K> extends Constructable | Procedure ? K : never;
declare function spyOn<
	T extends object,
	S extends Properties<Required<T>>
>(object: T, key: S, accessor: "get"): Mock<() => T[S]>;
declare function spyOn<
	T extends object,
	G extends Properties<Required<T>>
>(object: T, key: G, accessor: "set"): Mock<(arg: T[G]) => void>;
declare function spyOn<
	T extends object,
	M extends Classes<Required<T>> | Methods<Required<T>>
>(object: T, key: M): Required<T>[M] extends Constructable | Procedure ? Mock<Required<T>[M]> : never;
declare function spyOn<
	T extends object,
	K extends keyof any
>(object: T, key: SpyOnMethodKey<T, K>): Mock<SpyOnMethod<T, K>>;
declare function restoreAllMocks(): void;
declare function clearAllMocks(): void;
declare function resetAllMocks(): void;

type index_d_Constructable = Constructable;
type index_d_MaybeMocked<T> = MaybeMocked<T>;
type index_d_MaybeMockedConstructor<T> = MaybeMockedConstructor<T>;
type index_d_MaybeMockedDeep<T> = MaybeMockedDeep<T>;
type index_d_MaybePartiallyMocked<T> = MaybePartiallyMocked<T>;
type index_d_MaybePartiallyMockedDeep<T> = MaybePartiallyMockedDeep<T>;
type index_d_Mock<T extends Procedure | Constructable = Procedure> = Mock<T>;
type index_d_MockContext<T extends Procedure | Constructable = Procedure> = MockContext<T>;
type index_d_MockInstance<T extends Procedure | Constructable = Procedure> = MockInstance<T>;
type index_d_MockInstanceOption = MockInstanceOption;
type index_d_MockParameters<T extends Procedure | Constructable> = MockParameters<T>;
type index_d_MockProcedureContext<T extends Procedure | Constructable> = MockProcedureContext<T>;
type index_d_MockResult<T> = MockResult<T>;
type index_d_MockResultIncomplete = MockResultIncomplete;
type index_d_MockResultReturn<T> = MockResultReturn<T>;
type index_d_MockResultThrow = MockResultThrow;
type index_d_MockReturnType<T extends Procedure | Constructable> = MockReturnType<T>;
type index_d_MockSettledResult<T> = MockSettledResult<T>;
type index_d_MockSettledResultFulfilled<T> = MockSettledResultFulfilled<T>;
type index_d_MockSettledResultIncomplete = MockSettledResultIncomplete;
type index_d_MockSettledResultRejected = MockSettledResultRejected;
type index_d_Mocked<T> = Mocked<T>;
type index_d_MockedClass<T extends Constructable> = MockedClass<T>;
type index_d_MockedFunction<T extends Procedure | Constructable> = MockedFunction<T>;
type index_d_MockedFunctionDeep<T extends Procedure | Constructable> = MockedFunctionDeep<T>;
type index_d_MockedObject<T> = MockedObject<T>;
type index_d_MockedObjectDeep<T> = MockedObjectDeep<T>;
type index_d_PartialMock<T extends Procedure | Constructable = Procedure> = PartialMock<T>;
type index_d_PartiallyMockedFunction<T extends Procedure | Constructable> = PartiallyMockedFunction<T>;
type index_d_PartiallyMockedFunctionDeep<T extends Procedure | Constructable> = PartiallyMockedFunctionDeep<T>;
type index_d_Procedure = Procedure;
declare const index_d_clearAllMocks: typeof clearAllMocks;
declare const index_d_createMockInstance: typeof createMockInstance;
declare const index_d_fn: typeof fn;
declare const index_d_isMockFunction: typeof isMockFunction;
declare const index_d_resetAllMocks: typeof resetAllMocks;
declare const index_d_restoreAllMocks: typeof restoreAllMocks;
declare const index_d_spyOn: typeof spyOn;
declare namespace index_d {
  export { index_d_clearAllMocks as clearAllMocks, index_d_createMockInstance as createMockInstance, index_d_fn as fn, index_d_isMockFunction as isMockFunction, index_d_resetAllMocks as resetAllMocks, index_d_restoreAllMocks as restoreAllMocks, index_d_spyOn as spyOn };
  export type { index_d_Constructable as Constructable, index_d_MaybeMocked as MaybeMocked, index_d_MaybeMockedConstructor as MaybeMockedConstructor, index_d_MaybeMockedDeep as MaybeMockedDeep, index_d_MaybePartiallyMocked as MaybePartiallyMocked, index_d_MaybePartiallyMockedDeep as MaybePartiallyMockedDeep, index_d_Mock as Mock, index_d_MockContext as MockContext, index_d_MockInstance as MockInstance, index_d_MockInstanceOption as MockInstanceOption, index_d_MockParameters as MockParameters, index_d_MockProcedureContext as MockProcedureContext, index_d_MockResult as MockResult, index_d_MockResultIncomplete as MockResultIncomplete, index_d_MockResultReturn as MockResultReturn, index_d_MockResultThrow as MockResultThrow, index_d_MockReturnType as MockReturnType, index_d_MockSettledResult as MockSettledResult, index_d_MockSettledResultFulfilled as MockSettledResultFulfilled, index_d_MockSettledResultIncomplete as MockSettledResultIncomplete, index_d_MockSettledResultRejected as MockSettledResultRejected, index_d_Mocked as Mocked, index_d_MockedClass as MockedClass, index_d_MockedFunction as MockedFunction, index_d_MockedFunctionDeep as MockedFunctionDeep, index_d_MockedObject as MockedObject, index_d_MockedObjectDeep as MockedObjectDeep, index_d_PartialMock as PartialMock, index_d_PartiallyMockedFunction as PartiallyMockedFunction, index_d_PartiallyMockedFunctionDeep as PartiallyMockedFunctionDeep, index_d_Procedure as Procedure };
}

interface Formatter {
    (input?: unknown): string;
    open: string;
    close: string;
}

/** The Standard Typed interface. This is a base type extended by other specs. */
interface StandardTypedV1<Input = unknown, Output = Input> {
    /** The Standard properties. */
    readonly "~standard": StandardTypedV1.Props<Input, Output>;
}
declare namespace StandardTypedV1 {
    /** The Standard Typed properties interface. */
    interface Props<Input = unknown, Output = Input> {
        /** The version number of the standard. */
        readonly version: 1;
        /** The vendor name of the schema library. */
        readonly vendor: string;
        /** Inferred types associated with the schema. */
        readonly types?: Types<Input, Output> | undefined;
    }
    /** The Standard Typed types interface. */
    interface Types<Input = unknown, Output = Input> {
        /** The input type of the schema. */
        readonly input: Input;
        /** The output type of the schema. */
        readonly output: Output;
    }
    /** Infers the input type of a Standard Typed. */
    type InferInput<Schema extends StandardTypedV1> = NonNullable<Schema["~standard"]["types"]>["input"];
    /** Infers the output type of a Standard Typed. */
    type InferOutput<Schema extends StandardTypedV1> = NonNullable<Schema["~standard"]["types"]>["output"];
}
/** The Standard Schema interface. */
interface StandardSchemaV1<Input = unknown, Output = Input> {
    /** The Standard Schema properties. */
    readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}
declare namespace StandardSchemaV1 {
    /** The Standard Schema properties interface. */
    interface Props<Input = unknown, Output = Input> extends StandardTypedV1.Props<Input, Output> {
        /** Validates unknown input values. */
        readonly validate: (value: unknown, options?: StandardSchemaV1.Options | undefined) => Result<Output> | Promise<Result<Output>>;
    }
    /** The result interface of the validate function. */
    type Result<Output> = SuccessResult<Output> | FailureResult;
    /** The result interface if validation succeeds. */
    interface SuccessResult<Output> {
        /** The typed output value. */
        readonly value: Output;
        /** A falsy value for `issues` indicates success. */
        readonly issues?: undefined;
    }
    interface Options {
        /** Explicit support for additional vendor-specific parameters, if needed. */
        readonly libraryOptions?: Record<string, unknown> | undefined;
    }
    /** The result interface if validation fails. */
    interface FailureResult {
        /** The issues of failed validation. */
        readonly issues: ReadonlyArray<Issue>;
    }
    /** The issue interface of the failure output. */
    interface Issue {
        /** The error message of the issue. */
        readonly message: string;
        /** The path of the issue, if any. */
        readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
    }
    /** The path segment interface of the issue. */
    interface PathSegment {
        /** The key representing a path segment. */
        readonly key: PropertyKey;
    }
    /** The Standard types interface. */
    interface Types<Input = unknown, Output = Input> extends StandardTypedV1.Types<Input, Output> {
    }
    /** Infers the input type of a Standard. */
    type InferInput<Schema extends StandardTypedV1> = StandardTypedV1.InferInput<Schema>;
    /** Infers the output type of a Standard. */
    type InferOutput<Schema extends StandardTypedV1> = StandardTypedV1.InferOutput<Schema>;
}

/**
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
interface Colors$1 {
	comment: {
		close: string;
		open: string;
	};
	content: {
		close: string;
		open: string;
	};
	prop: {
		close: string;
		open: string;
	};
	tag: {
		close: string;
		open: string;
	};
	value: {
		close: string;
		open: string;
	};
}
type Indent$1 = (arg0: string) => string;
type Refs$1 = Array<unknown>;
type Print$1 = (arg0: unknown) => string;
/**
* compare function used when sorting object keys, `null` can be used to skip over sorting.
*/
type CompareKeys$1 = ((a: string, b: string) => number) | null | undefined;
interface PrettyFormatOptions$1 {
	/**
	* Call `toJSON` on objects before formatting them.
	* Ignored after the formatter has already called `toJSON` once for a value.
	* @default true
	*/
	callToJSON?: boolean;
	/**
	* Whether to escape special characters in regular expressions.
	* @default false
	*/
	escapeRegex?: boolean;
	/**
	* Whether to escape special characters in strings.
	* @default true
	*/
	escapeString?: boolean;
	/**
	* Whether to highlight syntax using terminal colors.
	* @default false
	*/
	highlight?: boolean;
	/**
	* Number of spaces to use for each level of indentation.
	* @default 2
	*/
	indent?: number;
	/**
	* Maximum depth to recurse into nested values.
	* @default Infinity
	*/
	maxDepth?: number;
	/**
	* Maximum number of items to print in arrays, sets, maps, and similar collections.
	* @default Infinity
	*/
	maxWidth?: number;
	/**
	* Approximate per-depth-level budget for output length.
	* When the accumulated output at any single depth level exceeds this value,
	* further nesting is collapsed. This is a heuristic safety valve, not a hard
	* limit — total output can reach up to roughly `maxDepth × maxOutputLength`.
	* @default 1_000_000
	*/
	maxOutputLength?: number;
	/**
	* Whether to minimize added whitespace, including indentation and line breaks.
	*
	* When `true`, pretty-format defaults `spacingInner` to `' '`, `spacingOuter` to `''`,
	* and ignores indentation. It also changes the default for `printBasicPrototype`
	* from `true` to `false`, although an explicit `printBasicPrototype` still wins.
	* Explicit `spacingInner` / `spacingOuter` overrides still apply.
	* @default false
	*/
	min?: boolean;
	/**
	* Whether to print `Object` / `Array` prefixes for plain objects and arrays.
	*
	* Defaults to `true`, unless `min` is `true`, in which case it defaults to `false`.
	* An explicit `printBasicPrototype` value always overrides the `min` default.
	*/
	printBasicPrototype?: boolean;
	/**
	* Whether to include the function name when formatting functions.
	* @default true
	*/
	printFunctionName?: boolean;
	/**
	* Whether to include shadow-root contents when formatting DOM nodes.
	* @default true
	*/
	printShadowRoot?: boolean;
	/**
	* Compare function used when sorting object keys. Set to `null` to disable sorting.
	*/
	compareKeys?: CompareKeys$1;
	/**
	* Plugins used to serialize application-specific data types.
	* @default []
	*/
	plugins?: Plugins$1;
	/**
	* Whitespace inserted after commas between items or entries.
	*
	* For example, in `{a: 1, b: 2}` or `[1, 2]`, this controls the gap after each comma:
	* `{a: 1,${spacingInner}b: 2}`
	* `[1,${spacingInner}2]`
	*
	* Defaults to `'\n'` in regular mode and `' '` when `min` is `true`.
	* Can be overridden independently of `min`.
	*/
	spacingInner?: string;
	/**
	* Whitespace inserted immediately inside collection/object delimiters.
	*
	* For example, this controls the space or newline right after the opening delimiter
	* and right before the closing delimiter:
	* `{${spacingOuter}a: 1${spacingOuter}}`
	* `[${spacingOuter}1${spacingOuter}]`
	*
	* Defaults to `'\n'` in regular mode and `''` when `min` is `true`.
	* Can be overridden independently of `min`.
	*/
	spacingOuter?: string;
	/**
	* Whether to print strings using single quotes instead of double quotes.
	*
	* For example:
	* `"hello"` when `false`
	* `'hello'` when `true`
	*
	* @default false
	*/
	singleQuote?: boolean;
	/**
	* Whether to always quote object property keys.
	*
	* For example:
	* `{"a": 1}` when `true`
	* `{a: 1}` when `false` and the key is a valid identifier
	* `{"my-key": 1}` still stays quoted because it is not a valid identifier
	*
	* @default true
	*/
	quoteKeys?: boolean;
}
type OptionsReceived$1 = PrettyFormatOptions$1;
interface Config$1 {
	callToJSON: boolean;
	compareKeys: CompareKeys$1;
	colors: Colors$1;
	escapeRegex: boolean;
	escapeString: boolean;
	indent: string;
	maxDepth: number;
	maxWidth: number;
	min: boolean;
	plugins: Plugins$1;
	printBasicPrototype: boolean;
	printFunctionName: boolean;
	printShadowRoot: boolean;
	spacingInner: string;
	spacingOuter: string;
	singleQuote: boolean;
	quoteKeys: boolean;
	maxOutputLength: number;
}
type Printer$1 = (val: unknown, config: Config$1, indentation: string, depth: number, refs: Refs$1, hasCalledToJSON?: boolean) => string;
type Test$1 = (arg0: any) => boolean;
interface NewPlugin$1 {
	serialize: (val: any, config: Config$1, indentation: string, depth: number, refs: Refs$1, printer: Printer$1) => string;
	test: Test$1;
}
interface PluginOptions$1 {
	edgeSpacing: string;
	min: boolean;
	spacing: string;
}
interface OldPlugin$1 {
	print: (val: unknown, print: Print$1, indent: Indent$1, options: PluginOptions$1, colors: Colors$1) => string;
	test: Test$1;
}
type Plugin$1 = NewPlugin$1 | OldPlugin$1;
type Plugins$1 = Array<Plugin$1>;

/**
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/

type DiffOptionsColor = (arg: string) => string;
interface DiffOptions {
	aAnnotation?: string;
	aColor?: DiffOptionsColor;
	aIndicator?: string;
	bAnnotation?: string;
	bColor?: DiffOptionsColor;
	bIndicator?: string;
	changeColor?: DiffOptionsColor;
	changeLineTrailingSpaceColor?: DiffOptionsColor;
	commonColor?: DiffOptionsColor;
	commonIndicator?: string;
	commonLineTrailingSpaceColor?: DiffOptionsColor;
	contextLines?: number;
	emptyFirstOrLastLinePlaceholder?: string;
	expand?: boolean;
	includeChangeCounts?: boolean;
	omitAnnotationLines?: boolean;
	patchColor?: DiffOptionsColor;
	printBasicPrototype?: boolean;
	maxDepth?: number;
	compareKeys?: CompareKeys$1;
	truncateThreshold?: number;
	truncateAnnotation?: string;
	truncateAnnotationColor?: DiffOptionsColor;
}

/**
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/

interface StringifiedMemory {
	expected?: string;
	actual?: string;
}
interface Memorize {
	(pointer: "expected" | "actual", stringifiedValue: string): string;
}
/**
* @param a Expected value
* @param b Received value
* @param options Diff options
* @returns {string | null} a string diff
*/
declare function diff(a: any, b: any, options?: DiffOptions, memorize?: Memorize): string | undefined;
declare function printDiffOrStringify(received: unknown, expected: unknown, options?: DiffOptions, memory?: StringifiedMemory): string | undefined;

interface StringifyOptions extends PrettyFormatOptions$1 {
	maxLength?: number;
	filterNode?: string | ((node: any) => boolean);
}
declare function stringify(object: unknown, maxDepth?: number, { maxLength, filterNode, ...options }?: StringifyOptions): string;
declare function format(args: unknown[], options?: InspectOptions): string;
interface InspectOptions extends StringifyOptions {
	truncate?: number;
	multiline?: boolean;
}
declare function inspect(obj: unknown, options?: InspectOptions): string;

interface AsymmetricMatcherInterface {
	asymmetricMatch: (other: unknown, customTesters?: Array<Tester>) => boolean;
	toString: () => string;
	getExpectedType?: () => string;
	toAsymmetricMatcher?: () => string;
}
declare abstract class AsymmetricMatcher<
	T,
	State extends MatcherState = MatcherState
> implements AsymmetricMatcherInterface {
	protected sample: T;
	protected inverse: boolean;
	$$typeof: symbol;
	constructor(sample: T, inverse?: boolean);
	protected getMatcherContext(expect?: NextTestChai.ExpectStatic): State;
	abstract asymmetricMatch(other: unknown, customTesters?: Array<Tester>): boolean;
	abstract toString(): string;
	getExpectedType?(): string;
	toAsymmetricMatcher?(): string;
}
declare class StringContaining extends AsymmetricMatcher<string> {
	constructor(sample: string, inverse?: boolean);
	asymmetricMatch(other: string): boolean;
	toString(): string;
	getExpectedType(): string;
}
declare class Anything extends AsymmetricMatcher<void> {
	asymmetricMatch(other: unknown): boolean;
	toString(): string;
	toAsymmetricMatcher(): string;
}
declare class ObjectContaining extends AsymmetricMatcher<Record<string | symbol | number, unknown>> {
	constructor(sample: Record<string, unknown>, inverse?: boolean);
	getPrototype(obj: object): any;
	hasProperty(obj: object | null, property: string | symbol): boolean;
	getProperties(obj: object): (string | symbol)[];
	asymmetricMatch(other: any, customTesters?: Array<Tester>): boolean;
	toString(): string;
	getExpectedType(): string;
}
declare class ArrayContaining<T = unknown> extends AsymmetricMatcher<Array<T>> {
	constructor(sample: Array<T>, inverse?: boolean);
	asymmetricMatch(other: Array<T>, customTesters?: Array<Tester>): boolean;
	toString(): string;
	getExpectedType(): string;
}
declare class Any extends AsymmetricMatcher<any> {
	constructor(sample: unknown);
	fnNameFor(func: Function): string;
	asymmetricMatch(other: unknown): boolean;
	toString(): string;
	getExpectedType(): string;
	toAsymmetricMatcher(): string;
}
declare class StringMatching extends AsymmetricMatcher<RegExp> {
	constructor(sample: string | RegExp, inverse?: boolean);
	asymmetricMatch(other: string): boolean;
	toString(): string;
	getExpectedType(): string;
}
declare class SchemaMatching extends AsymmetricMatcher<StandardSchemaV1<unknown, unknown>> {
	private result;
	constructor(sample: StandardSchemaV1<unknown, unknown>, inverse?: boolean);
	asymmetricMatch(other: unknown): boolean;
	toString(): string;
	getExpectedType(): string;
	toAsymmetricMatcher(): string;
}
declare const JestAsymmetricMatchers: ChaiPlugin;

declare function matcherHint(matcherName: string, received?: string, expected?: string, options?: MatcherHintOptions): string;
declare function printReceived(object: unknown): string;
declare function printExpected(value: unknown): string;
declare function getMatcherUtils(): {
	EXPECTED_COLOR: Formatter;
	RECEIVED_COLOR: Formatter;
	INVERTED_COLOR: Formatter;
	BOLD_WEIGHT: Formatter;
	DIM_COLOR: Formatter;
	diff: typeof diff;
	matcherHint: typeof matcherHint;
	printReceived: typeof printReceived;
	printExpected: typeof printExpected;
	printDiffOrStringify: typeof printDiffOrStringify;
	printWithType: typeof printWithType;
};
declare function printWithType<T>(name: string, value: T, print: (value: T) => string): string;
declare function addCustomEqualityTesters(newTesters: Array<Tester>): void;
declare function getCustomEqualityTesters(): Array<Tester>;

/**
* Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*
*/

type ChaiPlugin = NextTestChai.ChaiPlugin;
type Tester = (this: TesterContext, a: any, b: any, customTesters: Array<Tester>) => boolean | undefined;
interface TesterContext {
	equals: (a: unknown, b: unknown, customTesters?: Array<Tester>, strictCheck?: boolean) => boolean;
}

interface MatcherHintOptions {
	comment?: string;
	expectedColor?: Formatter;
	isDirectExpectCall?: boolean;
	isNot?: boolean;
	promise?: string;
	receivedColor?: Formatter;
	secondArgument?: string;
	secondArgumentColor?: Formatter;
}
interface MatcherState {
	customTesters: Array<Tester>;
	assertionCalls: number;
	currentTestName?: string;
	/**
	* @deprecated exists only in types
	*/
	dontThrow?: () => void;
	/**
	* @deprecated exists only in types
	*/
	error?: Error;
	equals: (a: unknown, b: unknown, customTesters?: Array<Tester>, strictCheck?: boolean) => boolean;
	/**
	* @deprecated exists only in types
	*/
	expand?: boolean;
	expectedAssertionsNumber?: number | null;
	expectedAssertionsNumberErrorGen?: (() => Error) | null;
	isExpectingAssertions?: boolean;
	isExpectingAssertionsError?: Error | null;
	isNot: boolean;
	promise: string;
	/**
	* @deprecated exists only in types
	*/
	suppressedErrors: Array<Error>;
	testPath?: string;
	utils: ReturnType<typeof getMatcherUtils> & {
		diff: typeof diff;
		stringify: typeof stringify;
		iterableEquality: Tester;
		subsetEquality: Tester;
	};
	soft?: boolean;
	poll?: boolean;
	/**
	* The same assertion instance that chai plugins receive.
	* @experimental
	* @see {@link https://www.chaijs.com/guide/plugins/} Core Plugin Concepts
	*/
	readonly assertion: Assertion;
}
interface SyncExpectationResult {
	pass: boolean;
	message: () => string;
	actual?: any;
	expected?: any;
	meta?: object;
}
type AsyncExpectationResult = Promise<SyncExpectationResult>;
type ExpectationResult = SyncExpectationResult | AsyncExpectationResult;
interface RawMatcherFn<
	T extends MatcherState = MatcherState,
	E extends Array<any> = Array<any>
> {
	(this: T, received: any, ...expected: E): ExpectationResult;
}
interface Matchers<
	R extends void | Promise<void> = void | Promise<void>,
	T = unknown
> {}
type MatchersObject<T extends MatcherState = MatcherState> = Record<string, RawMatcherFn<T>> & ThisType<T> & { [K in keyof Matchers]?: RawMatcherFn<T, Parameters<Matchers[K]>> };
interface ExpectStatic extends NextTestChai.ExpectStatic, Matchers<any>, AsymmetricMatchersContaining {
	<T>(actual: T, message?: string): Assertion<void, T>;
	extend: (expects: MatchersObject) => void;
	anything: () => any;
	any: (constructor: unknown) => any;
	getState: () => MatcherState;
	setState: (state: Partial<MatcherState>) => void;
	not: AsymmetricMatchersContaining;
}
interface CustomMatcher<R = any> {
	/**
	* Checks that a value satisfies a custom matcher function.
	*
	* @param matcher - A function returning a boolean based on the custom condition
	* @param message - Optional custom error message on failure
	*
	* @example
	* expect(age).toSatisfy(val => val >= 18, 'Age must be at least 18');
	* expect(age).toEqual(expect.toSatisfy(val => val >= 18, 'Age must be at least 18'));
	*/
	toSatisfy: (matcher: (value: any) => boolean, message?: string) => R;
	/**
	* Matches if the received value is one of the values in the expected array or set.
	*
	* @example
	* expect(1).toBeOneOf([1, 2, 3])
	* expect('foo').toBeOneOf([expect.any(String)])
	* expect({ a: 1 }).toEqual({ a: expect.toBeOneOf(['1', '2', '3']) })
	*/
	toBeOneOf: <T>(sample: ReadonlyArray<T> | ReadonlySet<T>) => R;
}
interface AsymmetricMatchersContaining extends Matchers<any>, CustomMatcher {
	/**
	* Matches if the received string contains the expected substring.
	*
	* @example
	* expect('I have an apple').toEqual(expect.stringContaining('apple'));
	* expect({ a: 'test string' }).toEqual({ a: expect.stringContaining('test') });
	*/
	stringContaining: (expected: string) => any;
	/**
	* Matches if the received object contains all properties of the expected object.
	*
	* @example
	* expect({ a: '1', b: 2 }).toEqual(expect.objectContaining({ a: '1' }))
	*/
	objectContaining: <T = any>(expected: DeeplyAllowMatchers<T>) => any;
	/**
	* Matches if the received array contains all elements in the expected array.
	*
	* @example
	* expect(['a', 'b', 'c']).toEqual(expect.arrayContaining(['b', 'a']));
	*/
	arrayContaining: <T = unknown>(expected: Array<DeeplyAllowMatchers<T>>) => any;
	/**
	* Matches if the received string or regex matches the expected pattern.
	*
	* @example
	* expect('hello world').toEqual(expect.stringMatching(/^hello/));
	* expect('hello world').toEqual(expect.stringMatching('hello'));
	*/
	stringMatching: (expected: string | RegExp) => any;
	/**
	* Matches if the received number is within a certain precision of the expected number.
	*
	* @example
	* expect(10.45).toEqual(expect.closeTo(10.5, 1));
	* expect(5.11).toEqual(expect.closeTo(5.12)); // with default precision
	*/
	closeTo: (expected: number, precision?: number) => any;
	/**
	* Matches if the received value validates against a Standard Schema.
	*
	* @param schema - A Standard Schema V1 compatible schema object
	*
	* @example
	* expect(user).toEqual(expect.schemaMatching(z.object({ name: z.string() })))
	* expect(['hello', 'world']).toEqual([expect.schemaMatching(z.string()), expect.schemaMatching(z.string())])
	*/
	schemaMatching: (schema: unknown) => any;
}
type WithAsymmetricMatcher<T> = T | AsymmetricMatcher<unknown>;
type DeeplyAllowMatchers<T> = T extends Array<infer Element> ? WithAsymmetricMatcher<T> | DeeplyAllowMatchers<Element>[] : T extends object ? WithAsymmetricMatcher<T> | { [K in keyof T]: DeeplyAllowMatchers<T[K]> } : WithAsymmetricMatcher<T>;
interface JestAssertion<
	R extends void | Promise<void>,
	T = unknown
> extends CustomMatcher<R> {
	/**
	* Used when you want to check that two objects have the same value.
	* This matcher recursively checks the equality of all fields, rather than checking for object identity.
	*
	* @example
	* expect(user).toEqual({ name: 'Alice', age: 30 });
	*/
	toEqual: <E>(expected: E) => R;
	/**
	* Use to test that objects have the same types as well as structure.
	*
	* @example
	* expect(user).toStrictEqual({ name: 'Alice', age: 30 });
	*/
	toStrictEqual: <E>(expected: E) => R;
	/**
	* Checks that a value is what you expect. It calls `Object.is` to compare values.
	* Don't use `toBe` with floating-point numbers.
	*
	* @example
	* expect(result).toBe(42);
	* expect(status).toBe(true);
	*/
	toBe: <E>(expected: E) => R;
	/**
	* Check that a string matches a regular expression.
	*
	* @example
	* expect(message).toMatch(/hello/);
	* expect(greeting).toMatch('world');
	*/
	toMatch: (expected: string | RegExp) => R;
	/**
	* Used to check that a JavaScript object matches a subset of the properties of an object
	*
	* @example
	* expect(user).toMatchObject({
	*   name: 'Alice',
	*   address: { city: 'Wonderland' }
	* });
	*/
	toMatchObject: <E extends object | any[]>(expected: E) => R;
	/**
	* Used when you want to check that an item is in a list.
	* For testing the items in the list, this uses `===`, a strict equality check.
	*
	* @example
	* expect(items).toContain('apple');
	* expect(numbers).toContain(5);
	*/
	toContain: <E>(item: E) => R;
	/**
	* Used when you want to check that an item is in a list.
	* For testing the items in the list, this matcher recursively checks the
	* equality of all fields, rather than checking for object identity.
	*
	* @example
	* expect(items).toContainEqual({ name: 'apple', quantity: 1 });
	*/
	toContainEqual: <E>(item: E) => R;
	/**
	* Use when you don't care what a value is, you just want to ensure a value
	* is true in a boolean context. In JavaScript, there are six falsy values:
	* `false`, `0`, `''`, `null`, `undefined`, and `NaN`. Everything else is truthy.
	*
	* @example
	* expect(user.isActive).toBeTruthy();
	*/
	toBeTruthy: () => R;
	/**
	* When you don't care what a value is, you just want to
	* ensure a value is false in a boolean context.
	*
	* @example
	* expect(user.isActive).toBeFalsy();
	*/
	toBeFalsy: () => R;
	/**
	* For comparing floating point numbers.
	*
	* @example
	* expect(score).toBeGreaterThan(10);
	*/
	toBeGreaterThan: (num: number | bigint) => R;
	/**
	* For comparing floating point numbers.
	*
	* @example
	* expect(score).toBeGreaterThanOrEqual(10);
	*/
	toBeGreaterThanOrEqual: (num: number | bigint) => R;
	/**
	* For comparing floating point numbers.
	*
	* @example
	* expect(score).toBeLessThan(10);
	*/
	toBeLessThan: (num: number | bigint) => R;
	/**
	* For comparing floating point numbers.
	*
	* @example
	* expect(score).toBeLessThanOrEqual(10);
	*/
	toBeLessThanOrEqual: (num: number | bigint) => R;
	/**
	* Used to check that a variable is NaN.
	*
	* @example
	* expect(value).toBeNaN();
	*/
	toBeNaN: () => R;
	/**
	* Used to check that a variable is undefined.
	*
	* @example
	* expect(value).toBeUndefined();
	*/
	toBeUndefined: () => R;
	/**
	* This is the same as `.toBe(null)` but the error messages are a bit nicer.
	* So use `.toBeNull()` when you want to check that something is null.
	*
	* @example
	* expect(value).toBeNull();
	*/
	toBeNull: () => R;
	/**
	* Used to check that a variable is nullable (null or undefined).
	*
	* @example
	* expect(value).toBeNullable();
	*/
	toBeNullable: () => R;
	/**
	* Ensure that a variable is not undefined.
	*
	* @example
	* expect(value).toBeDefined();
	*/
	toBeDefined: () => R;
	/**
	* Ensure that an object is an instance of a class.
	* This matcher uses `instanceof` underneath.
	*
	* @example
	* expect(new Date()).toBeInstanceOf(Date);
	*/
	toBeInstanceOf: <E>(expected: E) => R;
	/**
	* Used to check that an object has a `.length` property
	* and it is set to a certain numeric value.
	*
	* @example
	* expect([1, 2, 3]).toHaveLength(3);
	* expect('hello').toHaveLength(5);
	*/
	toHaveLength: (length: number) => R;
	/**
	* Use to check if a property at the specified path exists on an object.
	* For checking deeply nested properties, you may use dot notation or an array containing
	* the path segments for deep references.
	*
	* Optionally, you can provide a value to check if it matches the value present at the path
	* on the target object. This matcher uses 'deep equality' (like `toEqual()`) and recursively checks
	* the equality of all fields.
	*
	* @example
	* expect(user).toHaveProperty('address.city', 'New York');
	* expect(config).toHaveProperty(['settings', 'theme'], 'dark');
	*/
	toHaveProperty: <E>(property: string | (string | number)[], value?: E) => R;
	/**
	* Using exact equality with floating point numbers is a bad idea.
	* Rounding means that intuitive things fail.
	* The default for `numDigits` is 2.
	*
	* @example
	* expect(price).toBeCloseTo(9.99, 2);
	*/
	toBeCloseTo: (number: number, numDigits?: number) => R;
	/**
	* Ensures that a mock function is called an exact number of times.
	*
	* Also under the alias `expect.toBeCalledTimes`.
	*
	* @example
	* expect(mockFunc).toHaveBeenCalledTimes(2);
	*/
	toHaveBeenCalledTimes: (times: number) => R;
	/**
	* Ensures that a mock function is called an exact number of times.
	*
	* Alias for `expect.toHaveBeenCalledTimes`.
	*
	* @example
	* expect(mockFunc).toBeCalledTimes(2);
	* @deprecated Use `toHaveBeenCalledTimes` instead
	*/
	toBeCalledTimes: (times: number) => R;
	/**
	* Ensures that a mock function is called.
	*
	* Also under the alias `expect.toBeCalled`.
	*
	* @example
	* expect(mockFunc).toHaveBeenCalled();
	*/
	toHaveBeenCalled: () => R;
	/**
	* Ensures that a mock function is called.
	*
	* Alias for `expect.toHaveBeenCalled`.
	*
	* @example
	* expect(mockFunc).toBeCalled();
	* @deprecated Use `toHaveBeenCalled` instead
	*/
	toBeCalled: () => R;
	/**
	* Ensure that a mock function is called with specific arguments.
	*
	* Also under the alias `expect.toBeCalledWith`.
	*
	* @example
	* expect(mockFunc).toHaveBeenCalledWith('arg1', 42);
	*/
	toHaveBeenCalledWith: <E extends any[]>(...args: E) => R;
	/**
	* Ensure that a mock function is called with specific arguments.
	*
	* Alias for `expect.toHaveBeenCalledWith`.
	*
	* @example
	* expect(mockFunc).toBeCalledWith('arg1', 42);
	* @deprecated Use `toHaveBeenCalledWith` instead
	*/
	toBeCalledWith: <E extends any[]>(...args: E) => R;
	/**
	* Ensure that a mock function is called with specific arguments on an Nth call.
	*
	* Also under the alias `expect.nthCalledWith`.
	*
	* @example
	* expect(mockFunc).toHaveBeenNthCalledWith(2, 'secondArg');
	*/
	toHaveBeenNthCalledWith: <E extends any[]>(n: number, ...args: E) => R;
	/**
	* If you have a mock function, you can use `.toHaveBeenLastCalledWith`
	* to test what arguments it was last called with.
	*
	* Also under the alias `expect.lastCalledWith`.
	*
	* @example
	* expect(mockFunc).toHaveBeenLastCalledWith('lastArg');
	*/
	toHaveBeenLastCalledWith: <E extends any[]>(...args: E) => R;
	/**
	* Used to test that a function throws when it is called.
	*
	* Also under the alias `expect.toThrowError`.
	*
	* @example
	* expect(() => functionWithError()).toThrow('Error message');
	* expect(() => parseJSON('invalid')).toThrow(SyntaxError);
	* expect(() => { throw 42 }).toThrow(42);
	*/
	toThrow: (expected?: any) => R;
	/**
	* Used to test that a function throws when it is called.
	*
	* Alias for `expect.toThrow`.
	*
	* @example
	* expect(() => functionWithError()).toThrowError('Error message');
	* expect(() => parseJSON('invalid')).toThrowError(SyntaxError);
	* expect(() => { throw 42 }).toThrowError(42);
	* @deprecated Use `toThrow` instead
	*/
	toThrowError: (expected?: any) => R;
	/**
	* Use to test that the mock function successfully returned (i.e., did not throw an error) at least one time
	*
	* Alias for `expect.toHaveReturned`.
	*
	* @example
	* expect(mockFunc).toReturn();
	* @deprecated Use `toHaveReturned` instead
	*/
	toReturn: () => R;
	/**
	* Use to test that the mock function successfully returned (i.e., did not throw an error) at least one time
	*
	* Also under the alias `expect.toReturn`.
	*
	* @example
	* expect(mockFunc).toHaveReturned();
	*/
	toHaveReturned: () => R;
	/**
	* Use to ensure that a mock function returned successfully (i.e., did not throw an error) an exact number of times.
	* Any calls to the mock function that throw an error are not counted toward the number of times the function returned.
	*
	* Alias for `expect.toHaveReturnedTimes`.
	*
	* @example
	* expect(mockFunc).toReturnTimes(3);
	* @deprecated Use `toHaveReturnedTimes` instead
	*/
	toReturnTimes: (times: number) => R;
	/**
	* Use to ensure that a mock function returned successfully (i.e., did not throw an error) an exact number of times.
	* Any calls to the mock function that throw an error are not counted toward the number of times the function returned.
	*
	* Also under the alias `expect.toReturnTimes`.
	*
	* @example
	* expect(mockFunc).toHaveReturnedTimes(3);
	*/
	toHaveReturnedTimes: (times: number) => R;
	/**
	* Use to ensure that a mock function returned a specific value.
	*
	* Alias for `expect.toHaveReturnedWith`.
	*
	* @example
	* expect(mockFunc).toReturnWith('returnValue');
	* @deprecated Use `toHaveReturnedWith` instead
	*/
	toReturnWith: <E>(value: E) => R;
	/**
	* Use to ensure that a mock function returned a specific value.
	*
	* Also under the alias `expect.toReturnWith`.
	*
	* @example
	* expect(mockFunc).toHaveReturnedWith('returnValue');
	*/
	toHaveReturnedWith: <E>(value: E) => R;
	/**
	* Use to test the specific value that a mock function last returned.
	* If the last call to the mock function threw an error, then this matcher will fail
	* no matter what value you provided as the expected return value.
	*
	* Also under the alias `expect.lastReturnedWith`.
	*
	* @example
	* expect(mockFunc).toHaveLastReturnedWith('lastValue');
	*/
	toHaveLastReturnedWith: <E>(value: E) => R;
	/**
	* Use to test the specific value that a mock function returned for the nth call.
	* If the nth call to the mock function threw an error, then this matcher will fail
	* no matter what value you provided as the expected return value.
	*
	* Also under the alias `expect.nthReturnedWith`.
	*
	* @example
	* expect(mockFunc).toHaveNthReturnedWith(2, 'nthValue');
	*/
	toHaveNthReturnedWith: <E>(nthCall: number, value: E) => R;
}
type VitestAssertion<
	A,
	R extends void | Promise<void>,
	T = unknown
> = { [K in keyof A]: A[K] extends NextTestChai.Assertion ? Assertion<R, T> : A[K] extends (...args: any[]) => any ? R extends Promise<void> ? PromisifyFunction<A[K]> : A[K] : VitestAssertion<A[K], R, T> } & ((type: string, message?: string) => Assertion<R, T>);
type Promisify<O> = { [K in keyof O]: PromisifyFunction<O[K]> };
type PromisifyFunction<T> = T extends (...args: infer A) => infer R ? Promisify<T> & ((...args: A) => R extends Promise<any> ? R : Promise<R>) : T;
type PromisifyAssertion<T> = Assertion<Promise<void>, Awaited<T>>;
interface Assertion<
	R extends void | Promise<void> = void,
	T = unknown
> extends VitestAssertion<NextTestChai.Assertion, R, T>, JestAssertion<R, T>, ChaiMockAssertion<R, T>, Matchers<R, T> {
	/**
	* Ensures a value is of a specific type.
	*
	* @example
	* expect(value).toBeTypeOf('string');
	* expect(number).toBeTypeOf('number');
	*/
	toBeTypeOf: (expected: "bigint" | "boolean" | "function" | "number" | "object" | "string" | "symbol" | "undefined") => R;
	/**
	* Asserts that a mock function was called exactly once.
	*
	* @example
	* expect(mockFunc).toHaveBeenCalledOnce();
	*/
	toHaveBeenCalledOnce: () => R;
	/**
	* Ensure that a mock function is called with specific arguments and called
	* exactly once.
	*
	* @example
	* expect(mockFunc).toHaveBeenCalledExactlyOnceWith('arg1', 42);
	*/
	toHaveBeenCalledExactlyOnceWith: <E extends any[]>(...args: E) => R;
	/**
	* This assertion checks if a `Mock` was called before another `Mock`.
	* @param mock - A mock function created by `vi.spyOn` or `vi.fn`
	* @param failIfNoFirstInvocation - Fail if the first mock was never called
	* @example
	* const mock1 = vi.fn()
	* const mock2 = vi.fn()
	*
	* mock1()
	* mock2()
	* mock1()
	*
	* expect(mock1).toHaveBeenCalledBefore(mock2)
	*/
	toHaveBeenCalledBefore: (mock: MockInstance, failIfNoFirstInvocation?: boolean) => R;
	/**
	* This assertion checks if a `Mock` was called after another `Mock`.
	* @param mock - A mock function created by `vi.spyOn` or `vi.fn`
	* @param failIfNoFirstInvocation - Fail if the first mock was never called
	* @example
	* const mock1 = vi.fn()
	* const mock2 = vi.fn()
	*
	* mock2()
	* mock1()
	* mock2()
	*
	* expect(mock1).toHaveBeenCalledAfter(mock2)
	*/
	toHaveBeenCalledAfter: (mock: MockInstance, failIfNoFirstInvocation?: boolean) => R;
	/**
	* Checks that at least one of the mock function's calls has resolved.
	*
	* @example
	* expect(mockAsyncFunc).toHaveResolved();
	*/
	toHaveResolved: () => R;
	/**
	* Checks that at least one of the mock function's calls has resolved to a specific value.
	*
	* @example
	* expect(mockAsyncFunc).toHaveResolvedWith('success');
	*/
	toHaveResolvedWith: <E>(value: E) => R;
	/**
	* Ensures a promise resolves a specific number of times.
	*
	* @example
	* expect(mockAsyncFunc).toHaveResolvedTimes(3);
	*/
	toHaveResolvedTimes: (times: number) => R;
	/**
	* Asserts that the last resolved value of a promise matches an expected value.
	*
	* @example
	* await expect(mockAsyncFunc).toHaveLastResolvedWith('finalResult');
	*/
	toHaveLastResolvedWith: <E>(value: E) => R;
	/**
	* Ensures a specific value was returned by a promise on the nth resolution.
	*
	* @example
	* await expect(mockAsyncFunc).toHaveNthResolvedWith(2, 'secondResult');
	*/
	toHaveNthResolvedWith: <E>(nthCall: number, value: E) => R;
	/**
	* Verifies that a promise resolves.
	*
	* @example
	* await expect(someAsyncFunc).resolves.toBe(42);
	*/
	resolves: PromisifyAssertion<T>;
	/**
	* Verifies that a promise rejects.
	*
	* @example
	* await expect(someAsyncFunc).rejects.toThrow('error');
	*/
	rejects: PromisifyAssertion<unknown>;
}
/**
* NextTestChai-style assertions for spy/mock testing.
* These provide sinon-chai compatible assertion names that delegate to Jest-style implementations.
*/
interface ChaiMockAssertion<
	R extends void | Promise<void>,
	T = unknown
> {
	/**
	* Checks that a spy was called at least once.
	* NextTestChai-style equivalent of `toHaveBeenCalled`.
	*
	* @example
	* expect(spy).to.have.been.called
	*/
	readonly called: Assertion<R, T>;
	/**
	* Checks that a spy was called a specific number of times.
	* NextTestChai-style equivalent of `toHaveBeenCalledTimes`.
	*
	* @example
	* expect(spy).to.have.callCount(3)
	*/
	callCount: (count: number) => R;
	/**
	* Checks that a spy was called with specific arguments at least once.
	* NextTestChai-style equivalent of `toHaveBeenCalledWith`.
	*
	* @example
	* expect(spy).to.have.been.calledWith('arg1', 'arg2')
	*/
	calledWith: <E extends any[]>(...args: E) => R;
	/**
	* Checks that a spy was called exactly once.
	* NextTestChai-style equivalent of `toHaveBeenCalledOnce`.
	*
	* @example
	* expect(spy).to.have.been.calledOnce
	*/
	readonly calledOnce: Assertion<R, T>;
	/**
	* Checks that a spy was called exactly once with specific arguments.
	* NextTestChai-style equivalent of `toHaveBeenCalledExactlyOnceWith`.
	*
	* @example
	* expect(spy).to.have.been.calledOnceWith('arg1', 'arg2')
	*/
	calledOnceWith: <E extends any[]>(...args: E) => R;
	/**
	* Checks that the last call to a spy was made with specific arguments.
	* NextTestChai-style equivalent of `toHaveBeenLastCalledWith`.
	*
	* @example
	* expect(spy).to.have.been.lastCalledWith('arg1', 'arg2')
	*/
	lastCalledWith: <E extends any[]>(...args: E) => R;
	/**
	* Checks that the nth call to a spy was made with specific arguments.
	* NextTestChai-style equivalent of `toHaveBeenNthCalledWith`.
	*
	* @example
	* expect(spy).to.have.been.nthCalledWith(2, 'arg1', 'arg2')
	*/
	nthCalledWith: <E extends any[]>(n: number, ...args: E) => R;
	/**
	* Checks that a spy returned a specific value at least once.
	* NextTestChai-style equivalent of `toHaveReturnedWith`.
	*
	* @example
	* expect(spy).to.have.returned('value')
	*/
	returned: <E>(value: E) => R;
	/**
	* Checks that a spy returned a specific value at least once.
	* NextTestChai-style equivalent of `toHaveReturnedWith`.
	*
	* @example
	* expect(spy).to.have.returnedWith('value')
	*/
	returnedWith: <E>(value: E) => R;
	/**
	* Checks that a spy returned successfully a specific number of times.
	* NextTestChai-style equivalent of `toHaveReturnedTimes`.
	*
	* @example
	* expect(spy).to.have.returnedTimes(3)
	*/
	returnedTimes: (count: number) => R;
	/**
	* Checks that the last return value of a spy matches the expected value.
	* NextTestChai-style equivalent of `toHaveLastReturnedWith`.
	*
	* @example
	* expect(spy).to.have.lastReturnedWith('value')
	*/
	lastReturnedWith: <E>(value: E) => R;
	/**
	* Checks that the nth return value of a spy matches the expected value.
	* NextTestChai-style equivalent of `toHaveNthReturnedWith`.
	*
	* @example
	* expect(spy).to.have.nthReturnedWith(2, 'value')
	*/
	nthReturnedWith: <E>(n: number, value: E) => R;
	/**
	* Checks that a spy was called before another spy.
	* NextTestChai-style equivalent of `toHaveBeenCalledBefore`.
	*
	* @example
	* expect(spy1).to.have.been.calledBefore(spy2)
	*/
	calledBefore: (mock: MockInstance, failIfNoFirstInvocation?: boolean) => R;
	/**
	* Checks that a spy was called after another spy.
	* NextTestChai-style equivalent of `toHaveBeenCalledAfter`.
	*
	* @example
	* expect(spy1).to.have.been.calledAfter(spy2)
	*/
	calledAfter: (mock: MockInstance, failIfNoFirstInvocation?: boolean) => R;
	/**
	* Checks that a spy was called exactly twice.
	* NextTestChai-style equivalent of `toHaveBeenCalledTimes(2)`.
	*
	* @example
	* expect(spy).to.have.been.calledTwice
	*/
	readonly calledTwice: Assertion<R, T>;
	/**
	* Checks that a spy was called exactly three times.
	* NextTestChai-style equivalent of `toHaveBeenCalledTimes(3)`.
	*
	* @example
	* expect(spy).to.have.been.calledThrice
	*/
	readonly calledThrice: Assertion<R, T>;
}

declare const ChaiStyleAssertions: ChaiPlugin;

declare const MATCHERS_OBJECT: unique symbol;
declare const JEST_MATCHERS_OBJECT: unique symbol;
declare const GLOBAL_EXPECT: unique symbol;
declare const ASYMMETRIC_MATCHERS_OBJECT: unique symbol;

declare const customMatchers: MatchersObject;

declare const JestChaiExpect: ChaiPlugin;

declare const JestExtend: ChaiPlugin;

declare function equals(a: unknown, b: unknown, customTesters?: Array<Tester>, strictCheck?: boolean): boolean;
declare function isAsymmetric(obj: any): obj is AsymmetricMatcher<any>;
declare function hasAsymmetric(obj: any, seen?: Set<any>): boolean;
declare function isError(value: unknown): value is Error;
declare function isA(typeName: string, value: unknown): boolean;
declare function fnNameFor(func: Function): string;
declare function hasProperty(obj: object | null, property: string): boolean;
declare function isImmutableUnorderedKeyed(maybeKeyed: any): boolean;
declare function isImmutableUnorderedSet(maybeSet: any): boolean;
declare function iterableEquality(a: any, b: any, customTesters?: Array<Tester>, aStack?: Array<any>, bStack?: Array<any>): boolean | undefined;
declare function subsetEquality(object: unknown, subset: unknown, customTesters?: Array<Tester>): boolean | undefined;
declare function typeEquality(a: any, b: any): boolean | undefined;
declare function arrayBufferEquality(a: unknown, b: unknown): boolean | undefined;
declare function sparseArrayEquality(a: unknown, b: unknown, customTesters?: Array<Tester>): boolean | undefined;
declare function generateToBeMessage(deepEqualityName: string, expected?: string, actual?: string): string;
declare function pluralize(word: string, count: number): string;
declare function getObjectKeys(object: object): Array<string | symbol>;
declare function getObjectSubset(object: any, subset: any, customTesters: Array<Tester>): {
	subset: any;
	stripped: number;
};
/**
* Detects if an object is a Standard Schema V1 compatible schema
*/
declare function isStandardSchema(obj: any): obj is StandardSchemaV1;

declare function getState<State extends MatcherState = MatcherState>(expect: ExpectStatic): State;
declare function setState<State extends MatcherState = MatcherState>(state: Partial<State>, expect: ExpectStatic): void;

declare function createAssertionMessage(util: NextTestChai.ChaiUtils, assertion: NextTestChai.Assertion, hasArgs: boolean): string;
declare function recordAsyncExpect(_test: any, promise: Promise<any>, assertion: string, error: Error, isSoft?: boolean): Promise<any>;
/** wrap assertion function to support `expect.soft` and provide assertion name as `_name` */
declare function wrapAssertion(utils: NextTestChai.ChaiUtils, name: string, fn: (this: NextTestChai.AssertionStatic & Assertion, ...args: any[]) => void | PromiseLike<void>): (this: NextTestChai.AssertionStatic & Assertion, ...args: any[]) => void | PromiseLike<void>;

type Key = string | symbol;
type CreateMockInstanceProcedure = (options?: {
	prototypeMembers?: (string | symbol)[];
	name?: string | symbol;
	originalImplementation?: (...args: any[]) => any;
	keepMembersImplementation?: boolean;
}) => any;
interface MockObjectOptions {
	type: "automock" | "autospy";
	globalConstructors: GlobalConstructors;
	createMockInstance: CreateMockInstanceProcedure;
}
declare function mockObject(options: MockObjectOptions, object: Record<Key, any>, mockExports?: Record<Key, any>): Record<Key, any>;
interface GlobalConstructors {
	Object: ObjectConstructor;
	Function: FunctionConstructor;
	RegExp: RegExpConstructor;
	Array: ArrayConstructor;
	Map: MapConstructor;
}

interface ParsedStack {
	method: string;
	file: string;
	line: number;
	column: number;
}
interface SerializedError {
	message: string;
	stacks?: ParsedStack[];
	stack?: string;
	name?: string;
	cause?: SerializedError;
	[key: string]: unknown;
}
interface TestError extends SerializedError {
	cause?: TestError;
	diff?: string;
	actual?: string;
	expected?: string;
}

interface DomainMatchResult {
	pass: boolean;
	message?: string;
	/**
	* The captured value viewed through the template's lens.
	*
	* Where the template uses patterns (e.g. regexes) or omits details,
	* the resolved string adopts those patterns. Where the template doesn't
	* match, the resolved string uses literal captured values instead.
	*
	* Used for two purposes:
	* - **Diff display** (actual side): compared against `expected`
	*   so the diff highlights only genuine mismatches, not pattern-vs-literal noise.
	* - **Snapshot update** (`--update`): written as the new snapshot content,
	*   preserving user-edited patterns from matched regions while incorporating
	*   actual values for mismatched regions.
	*
	* When omitted, falls back to `render(capture(received))` (the raw rendered value).
	*/
	resolved?: string;
	/**
	* The stored template re-rendered as a string, representing what the user
	* originally wrote or last saved.
	*
	* Used as the expected side in diff display.
	*
	* When omitted, falls back to the raw snapshot string from the snap file
	* or inline snapshot.
	*/
	expected?: string;
}
interface DomainSnapshotAdapter<
	Captured = unknown,
	Expected = unknown
> {
	name: string;
	capture: (received: unknown) => Captured;
	render: (captured: Captured) => string;
	parseExpected: (input: string) => Expected;
	match: (captured: Captured, expected: Expected) => DomainMatchResult;
}

interface RawSnapshotInfo {
	file: string;
	readonly?: boolean;
	content?: string;
}

interface SnapshotEnvironment {
	getVersion: () => string;
	getHeader: () => string;
	resolvePath: (filepath: string) => Promise<string>;
	resolveRawPath: (testPath: string, rawPath: string) => Promise<string>;
	saveSnapshotFile: (filepath: string, snapshot: string) => Promise<void>;
	readSnapshotFile: (filepath: string) => Promise<string | null>;
	readSnapshotFileData?: (filepath: string) => Promise<Record<string, string> | null>;
	removeSnapshotFile: (filepath: string) => Promise<void>;
	processStackTrace?: (stack: ParsedStack) => ParsedStack;
}
declare class DefaultMap<
	K,
	V
> extends Map<K, V> {
	private defaultFn;
	constructor(defaultFn: (key: K) => V, entries?: Iterable<readonly [K, V]>);
	override get(key: K): V;
}
declare class CounterMap<K> extends DefaultMap<K, number> {
	constructor();
	_total: number | undefined;
	valueOf(): number;
	increment(key: K): void;
	total(): number;
}

interface SnapshotReturnOptions {
	actual: string;
	count: number;
	expected?: string;
	key: string;
	pass: boolean;
}
interface SaveStatus {
	deleted: boolean;
	saved: boolean;
}
interface ExpectedSnapshot {
	key: string;
	count: number;
	data?: string;
	markAsChecked: () => void;
}
declare class SnapshotState {
	testFilePath: string;
	snapshotPath: string;
	private _counters;
	private _dirty;
	private _updateSnapshot;
	private _snapshotData;
	private _initialData;
	private _inlineSnapshots;
	private _inlineSnapshotStacks;
	private _testIdToKeys;
	private _rawSnapshots;
	private _rawSnapshotFiles;
	private _uncheckedKeys;
	private _snapshotFormat;
	private _environment;
	private _fileExists;
	expand: boolean;
	private _added;
	private _matched;
	private _unmatched;
	private _updated;
	get added(): CounterMap<string>;
	set added(value: number);
	get matched(): CounterMap<string>;
	set matched(value: number);
	get unmatched(): CounterMap<string>;
	set unmatched(value: number);
	get updated(): CounterMap<string>;
	set updated(value: number);
	private constructor();
	static create(testFilePath: string, options: SnapshotStateOptions): Promise<SnapshotState>;
	get snapshotUpdateState(): SnapshotUpdateState;
	get environment(): SnapshotEnvironment;
	markSnapshotsAsCheckedForTest(testName: string): void;
	clearTest(testId: string): void;
	protected _inferInlineSnapshotStack(stacks: ParsedStack[]): ParsedStack | null;
	private _addSnapshot;
	private _resolveKey;
	private _resolveInlineStack;
	private _reconcile;
	save(): Promise<SaveStatus>;
	getUncheckedCount(): number;
	getUncheckedKeys(): Array<string>;
	removeUncheckedKeys(): void;
	probeExpectedSnapshot(options: Pick<SnapshotMatchOptions, "testName" | "testId" | "isInline" | "inlineSnapshot">): ExpectedSnapshot;
	match({ testId, testName, received, key, inlineSnapshot, isInline, error, rawSnapshot, assertionName }: SnapshotMatchOptions): SnapshotReturnOptions;
	processDomainSnapshot({ testId, received, expectedSnapshot, matchResult, isInline, error, assertionName }: ProcessDomainSnapshotOptions): SnapshotReturnOptions;
	/**
	* The snapshot file, if the test file stores snapshots in it, and every asserted file snapshot.
	*/
	getSnapshotFiles(): string[];
	pack(): Promise<SnapshotResult>;
}
type SnapshotUpdateState = "all" | "new" | "none";
interface SnapshotStateOptions {
	updateSnapshot: SnapshotUpdateState;
	snapshotEnvironment: SnapshotEnvironment;
	expand?: boolean;
	snapshotFormat?: OptionsReceived$1;
	resolveSnapshotPath?: (path: string, extension: string, context?: any) => string;
}
interface SnapshotMatchOptions {
	testId: string;
	testName: string;
	received: unknown;
	key?: string;
	inlineSnapshot?: string;
	isInline: boolean;
	error?: Error;
	rawSnapshot?: RawSnapshotInfo;
	assertionName?: string;
}
interface ProcessDomainSnapshotOptions {
	testId: string;
	received: string;
	expectedSnapshot: ExpectedSnapshot;
	matchResult?: DomainMatchResult;
	isInline?: boolean;
	assertionName?: string;
	error?: Error;
}
interface SnapshotResult {
	filepath: string;
	added: number;
	fileDeleted: boolean;
	matched: number;
	unchecked: number;
	uncheckedKeys: Array<string>;
	unmatched: number;
	updated: number;
}

interface AssertOptions {
	received: unknown;
	filepath: string;
	name: string;
	/**
	* Not required but needed for `SnapshotClient.clearTest` to implement test-retry behavior.
	* @default name
	*/
	testId?: string;
	message?: string;
	isInline?: boolean;
	properties?: object;
	inlineSnapshot?: string;
	error?: Error;
	errorMessage?: string;
	rawSnapshot?: RawSnapshotInfo;
	assertionName?: string;
}
interface AssertDomainOptions extends Omit<AssertOptions, "received"> {
	received: unknown;
	adapter: DomainSnapshotAdapter<any, any>;
}
interface AssertDomainPollOptions extends Omit<AssertDomainOptions, "received"> {
	poll: (options: {
		signal: AbortSignal;
	}) => Promise<unknown> | unknown;
	timeout?: number;
	interval?: number;
}
/** Same shape as expect.extend custom matcher result (SyncExpectationResult from @vitest/expect) */
interface MatchResult {
	pass: boolean;
	message: () => string;
	actual?: unknown;
	expected?: unknown;
}
interface SnapshotClientOptions {
	isEqual?: (received: unknown, expected: unknown) => boolean;
}
declare class SnapshotClient {
	private options;
	snapshotStateMap: Map<string, SnapshotState>;
	constructor(options?: SnapshotClientOptions);
	setup(filepath: string, options: SnapshotStateOptions): Promise<void>;
	finish(filepath: string): Promise<SnapshotResult>;
	skipTest(filepath: string, testName: string): void;
	clearTest(filepath: string, testId: string): void;
	getSnapshotState(filepath: string): SnapshotState;
	match(options: AssertOptions): MatchResult;
	assert(options: AssertOptions): void;
	matchDomain(options: AssertDomainOptions): MatchResult;
	pollMatchDomain(options: AssertDomainPollOptions): Promise<MatchResult>;
	assertRaw(options: AssertOptions): Promise<void>;
	clear(): void;
}

declare function stripSnapshotIndentation(inlineSnapshot: string): string;

/**
* Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/

declare function addSerializer(plugin: Plugin$1): void;
declare function getSerializers(): Plugins$1;

/**
 * Negates a boolean type.
 */
type Not<T extends boolean> = T extends true ? false : true;
/**
 * Returns `true` if at least one of the types in the
 * {@linkcode Types} array is `true`, otherwise returns `false`.
 */
type Or<Types extends boolean[]> = Types[number] extends false ? false : true;
/**
 * Checks if all the boolean types in the {@linkcode Types} array are `true`.
 */
type And<Types extends boolean[]> = Types[number] extends true ? true : false;
/**
 * Represents an equality type that returns {@linkcode Right} if
 * {@linkcode Left} is `true`,
 * otherwise returns the negation of {@linkcode Right}.
 */
type Eq<Left extends boolean, Right extends boolean> = Left extends true ? Right : Not<Right>;
/**
 * @internal
 */
declare const secret: unique symbol;
/**
 * @internal
 */
type Secret = typeof secret;
/**
 * Checks if the given type is `never`.
 */
type IsNever<T> = [T] extends [never] ? true : false;
/**
 * Checks if the given type is `any`.
 */
type IsAny<T> = [T] extends [Secret] ? Not<IsNever<T>> : false;
/**
 * Determines if the given type is `unknown`.
 */
type IsUnknown<T> = [unknown] extends [T] ? Not<IsAny<T>> : false;
/**
 * Subjective "useful" keys from a type. For objects it's just `keyof` but for
 * tuples/arrays it's the number keys.
 *
 * @example
 * ```ts
 * UsefulKeys<{ a: 1; b: 2 }> // 'a' | 'b'
 *
 * UsefulKeys<['a', 'b']> // '0' | '1'
 *
 * UsefulKeys<string[]> // number
 * ```
 */
type UsefulKeys<T> = T extends any[] ? {
    [K in keyof T]: K;
}[number] : keyof T;
/**
 * Extracts the keys from a type that are required (not optional).
 */
type RequiredKeys<T> = Extract<{
    [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T], keyof T>;
/**
 * Gets the keys of an object type that are optional.
 */
type OptionalKeys<T> = Exclude<keyof T, RequiredKeys<T>>;
/**
 * Extracts the keys from a type that are not `readonly`.
 */
type ReadonlyKeys<T> = Extract<{
    [K in keyof T]-?: ReadonlyEquivalent<{
        [_K in K]: T[K];
    }, {
        -readonly [_K in K]: T[K];
    }> extends true ? never : K;
}[keyof T], keyof T>;
/**
 * Determines if two types, are equivalent in a `readonly` manner.
 *
 * @internal
 */
type ReadonlyEquivalent<X, Y> = Extends<(<T>() => T extends X ? true : false), (<T>() => T extends Y ? true : false)>;
/**
 * Checks if one type extends another. Note: this is not quite the same as `Left extends Right` because:
 * 1. If either type is `never`, the result is `true` iff the other type is also `never`.
 * 2. Types are wrapped in a 1-tuple so that union types are not distributed - instead we consider `string | number` to _not_ extend `number`. If we used `Left extends Right` directly you would get `Extends<string | number, number>` => `false | true` => `boolean`.
 */
type Extends<Left, Right> = IsNever<Left> extends true ? IsNever<Right> : [Left] extends [Right] ? true : false;
/**
 * Checks if the {@linkcode Left} type extends the {@linkcode Right} type,
 * excluding `any` or `never`.
 */
type ExtendsExcludingAnyOrNever<Left, Right> = IsAny<Left> extends true ? IsAny<Right> : Extends<Left, Right>;
/**
 * Checks if two types are strictly equal using
 * the TypeScript internal identical-to operator.
 *
 * @see {@link https://github.com/microsoft/TypeScript/issues/55188#issuecomment-1656328122 | much history}
 */
type StrictEqualUsingTSInternalIdenticalToOperator<L, R> = (<T>() => T extends (L & T) | T ? true : false) extends <T>() => T extends (R & T) | T ? true : false ? IsNever<L> extends IsNever<R> ? true : false : false;
/**
 * Checks that {@linkcode Left} and {@linkcode Right} extend each other.
 * Not quite the same as an equality check since `any` can make it resolve
 * to `true`. So should only be used when {@linkcode Left} and
 * {@linkcode Right} are known to avoid `any`.
 */
type MutuallyExtends<Left, Right> = And<[Extends<Left, Right>, Extends<Right, Left>]>;
/**
 * @internal
 */
declare const mismatch: unique symbol;
/**
 * @internal
 */
type Mismatch = {
    [mismatch]: 'mismatch';
};
/**
 * A type which should match anything passed as a value but *doesn't*
 * match {@linkcode Mismatch}. It helps TypeScript select the right overload
 * for {@linkcode PositiveExpectTypeOf.toEqualTypeOf | .toEqualTypeOf()} and
 * {@linkcode PositiveExpectTypeOf.toMatchTypeOf | .toMatchTypeOf()}.
 *
 * @internal
 */
declare const avalue: unique symbol;
/**
 * Represents a value that can be of various types.
 */
type AValue = {
    [avalue]?: undefined;
} | string | number | boolean | symbol | bigint | null | undefined | void;
/**
 * Represents the type of mismatched arguments between
 * the actual result and the expected result.
 *
 * If {@linkcode ActualResult} and {@linkcode ExpectedResult} are equivalent,
 * the type resolves to an empty tuple `[]`, indicating no mismatch.
 * If they are not equivalent, it resolves to a tuple containing the element
 * {@linkcode Mismatch}, signifying a discrepancy between
 * the expected and actual results.
 */
type MismatchArgs<ActualResult extends boolean, ExpectedResult extends boolean> = Eq<ActualResult, ExpectedResult> extends true ? [] : [Mismatch];
/**
 * Convert a union to an intersection.
 * `A | B | C` -\> `A & B & C`
 */
type UnionToIntersection<Union> = (Union extends any ? (distributedUnion: Union) => void : never) extends (mergedIntersection: infer Intersection) => void ? Intersection : never;
/**
 * Get the last element of a union.
 * First, converts to a union of `() => T` functions,
 * then uses {@linkcode UnionToIntersection} to get the last one.
 */
type LastOf<Union> = UnionToIntersection<Union extends any ? () => Union : never> extends () => infer R ? R : never;
/**
 * Intermediate type for {@linkcode UnionToTuple} which pushes the
 * "last" union member to the end of a tuple, and recursively prepends
 * the remainder of the union.
 */
type TuplifyUnion<Union, LastElement = LastOf<Union>> = IsNever<Union> extends true ? [] : [...TuplifyUnion<Exclude<Union, LastElement>>, LastElement];
/**
 * Convert a union like `1 | 2 | 3` to a tuple like `[1, 2, 3]`.
 */
type UnionToTuple<Union> = TuplifyUnion<Union>;
/** The numbers between 0 and 9 that you learned in school */
type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
/**
 * e.g. `['a', 'b']` -> `{ 0: 'a', 1: 'b' }`
 * Looks at the keys to see which look digit-like, so could do the wrong thing for types like
 * `['a', 'b'] & {'1foo': string}`
 */
type TupleToRecord<T extends any[]> = {
    [K in keyof T as `${Extract<K, `${Digit}${string}`>}`]: T[K];
};
/** `true` iff `T` is a tuple, as opposed to an indeterminate-length array */
type IsTuple<T extends readonly any[]> = number extends T['length'] ? false : true;
/** `true` iff `T` is a record accepting any string keys, or accepting any number keys */
type IsRecord<T> = Or<[Extends<string, keyof T>, Extends<number, keyof T>]>;
type IsUnion<T> = Not<Extends<UnionToTuple<T>['length'], 1>>;
/**
 * A recursive version of `Pick` that selects properties from the left type that are present in the right type.
 * The "leaf" types from `Left` are used - only the keys of `Right` are considered.
 *
 * @example
 * ```ts
 * const user = {email: 'a@b.com', name: 'John Doe', address: {street: '123 2nd St', city: 'New York', zip: '10001', state: 'NY', country: 'USA'}}
 *
 * type Result = DeepPickMatchingProps<typeof user, {name: unknown; address: {city: unknown}}> // {name: string, address: {city: string}}
 * ```
 */
type DeepPickMatchingProps<Left, Right> = Left extends Record<string, unknown> ? Pick<{
    [K in keyof Left]: K extends keyof Right ? DeepPickMatchingProps<Left[K], Right[K]> : never;
}, Extract<keyof Left, keyof Right>> : Left;

/**
 * The simple(ish) way to get overload info from a function
 * {@linkcode FunctionType}. Recent versions of TypeScript will match any
 * function against a generic 10-overload type, filling in slots with
 * duplicates of the function. So, we can just match against a single type
 * and get all the overloads.
 *
 * For older versions of TypeScript, we'll need to painstakingly do
 * ten separate matches.
 */
type TSPost53OverloadsInfoUnion<FunctionType> = FunctionType extends {
    (...args: infer A1): infer R1;
    (...args: infer A2): infer R2;
    (...args: infer A3): infer R3;
    (...args: infer A4): infer R4;
    (...args: infer A5): infer R5;
    (...args: infer A6): infer R6;
    (...args: infer A7): infer R7;
    (...args: infer A8): infer R8;
    (...args: infer A9): infer R9;
    (...args: infer A10): infer R10;
} ? ((...p: A1) => R1) | ((...p: A2) => R2) | ((...p: A3) => R3) | ((...p: A4) => R4) | ((...p: A5) => R5) | ((...p: A6) => R6) | ((...p: A7) => R7) | ((...p: A8) => R8) | ((...p: A9) => R9) | ((...p: A10) => R10) : never;
/**
 * A function with `unknown` parameters and return type.
 */
type UnknownFunction = (...args: unknown[]) => unknown;
/**
 * `true` iff {@linkcode FunctionType} is
 * equivalent to `(...args: unknown[]) => unknown`,
 * which is what an overload variant looks like for a non-existent overload.
 * This is useful because older versions of TypeScript end up with
 * 9 "useless" overloads and one real one for parameterless/generic functions.
 *
 * @see {@link https://github.com/microsoft/TypeScript/issues/28867 | Related}
 */
type IsUselessOverloadInfo<FunctionType> = StrictEqualUsingTSInternalIdenticalToOperator<FunctionType, UnknownFunction>;
/**
 * Old versions of TypeScript can sometimes seem to refuse to separate out
 * union members unless you put them each in a pointless tuple and add an
 * extra `infer X` expression. There may be a better way to work around this
 * problem, but since it's not a problem in newer versions of TypeScript,
 * it's not a priority right now.
 */
type Tuplify<Union> = Union extends infer X ? [X] : never;
/**
 * For older versions of TypeScript, we need two separate workarounds
 * to get overload info. First, we need need to use
 * {@linkcode DecreasingOverloadsInfoUnion} to get the overload info for
 * functions with 1-10 overloads. Then, we need to filter out the
 * "useless" overloads that are present in older versions of TypeScript,
 * for parameterless functions. To do this we use
 * {@linkcode IsUselessOverloadInfo} to remove useless overloads.
 *
 * @see {@link https://github.com/microsoft/TypeScript/issues/28867 | Related}
 */
type TSPre53OverloadsInfoUnion<FunctionType> = Tuplify<DecreasingOverloadsInfoUnion<FunctionType>> extends infer Tup ? Tup extends [infer Fn] ? IsUselessOverloadInfo<Fn> extends true ? never : Fn : never : never;
/**
 * For versions of TypeScript below 5.3, we need to check for 10 overloads,
 * then 9, then 8, etc., to get a union of the overload variants.
 */
type DecreasingOverloadsInfoUnion<F> = F extends {
    (...args: infer A1): infer R1;
    (...args: infer A2): infer R2;
    (...args: infer A3): infer R3;
    (...args: infer A4): infer R4;
    (...args: infer A5): infer R5;
    (...args: infer A6): infer R6;
    (...args: infer A7): infer R7;
    (...args: infer A8): infer R8;
    (...args: infer A9): infer R9;
    (...args: infer A10): infer R10;
} ? ((...p: A1) => R1) | ((...p: A2) => R2) | ((...p: A3) => R3) | ((...p: A4) => R4) | ((...p: A5) => R5) | ((...p: A6) => R6) | ((...p: A7) => R7) | ((...p: A8) => R8) | ((...p: A9) => R9) | ((...p: A10) => R10) : F extends {
    (...args: infer A1): infer R1;
    (...args: infer A2): infer R2;
    (...args: infer A3): infer R3;
    (...args: infer A4): infer R4;
    (...args: infer A5): infer R5;
    (...args: infer A6): infer R6;
    (...args: infer A7): infer R7;
    (...args: infer A8): infer R8;
    (...args: infer A9): infer R9;
} ? ((...p: A1) => R1) | ((...p: A2) => R2) | ((...p: A3) => R3) | ((...p: A4) => R4) | ((...p: A5) => R5) | ((...p: A6) => R6) | ((...p: A7) => R7) | ((...p: A8) => R8) | ((...p: A9) => R9) : F extends {
    (...args: infer A1): infer R1;
    (...args: infer A2): infer R2;
    (...args: infer A3): infer R3;
    (...args: infer A4): infer R4;
    (...args: infer A5): infer R5;
    (...args: infer A6): infer R6;
    (...args: infer A7): infer R7;
    (...args: infer A8): infer R8;
} ? ((...p: A1) => R1) | ((...p: A2) => R2) | ((...p: A3) => R3) | ((...p: A4) => R4) | ((...p: A5) => R5) | ((...p: A6) => R6) | ((...p: A7) => R7) | ((...p: A8) => R8) : F extends {
    (...args: infer A1): infer R1;
    (...args: infer A2): infer R2;
    (...args: infer A3): infer R3;
    (...args: infer A4): infer R4;
    (...args: infer A5): infer R5;
    (...args: infer A6): infer R6;
    (...args: infer A7): infer R7;
} ? ((...p: A1) => R1) | ((...p: A2) => R2) | ((...p: A3) => R3) | ((...p: A4) => R4) | ((...p: A5) => R5) | ((...p: A6) => R6) | ((...p: A7) => R7) : F extends {
    (...args: infer A1): infer R1;
    (...args: infer A2): infer R2;
    (...args: infer A3): infer R3;
    (...args: infer A4): infer R4;
    (...args: infer A5): infer R5;
    (...args: infer A6): infer R6;
} ? ((...p: A1) => R1) | ((...p: A2) => R2) | ((...p: A3) => R3) | ((...p: A4) => R4) | ((...p: A5) => R5) | ((...p: A6) => R6) : F extends {
    (...args: infer A1): infer R1;
    (...args: infer A2): infer R2;
    (...args: infer A3): infer R3;
    (...args: infer A4): infer R4;
    (...args: infer A5): infer R5;
} ? ((...p: A1) => R1) | ((...p: A2) => R2) | ((...p: A3) => R3) | ((...p: A4) => R4) | ((...p: A5) => R5) : F extends {
    (...args: infer A1): infer R1;
    (...args: infer A2): infer R2;
    (...args: infer A3): infer R3;
    (...args: infer A4): infer R4;
} ? ((...p: A1) => R1) | ((...p: A2) => R2) | ((...p: A3) => R3) | ((...p: A4) => R4) : F extends {
    (...args: infer A1): infer R1;
    (...args: infer A2): infer R2;
    (...args: infer A3): infer R3;
} ? ((...p: A1) => R1) | ((...p: A2) => R2) | ((...p: A3) => R3) : F extends {
    (...args: infer A1): infer R1;
    (...args: infer A2): infer R2;
} ? ((...p: A1) => R1) | ((...p: A2) => R2) : F extends (...args: infer A1) => infer R1 ? ((...p: A1) => R1) : never;
/**
 * Get a union of overload variants for a function {@linkcode FunctionType}.
 * Does a check for whether we can do the one-shot
 * 10-overload matcher (which works for ts\>5.3), and if not,
 * falls back to the more complicated utility.
 */
type OverloadsInfoUnion<FunctionType> = IsNever<TSPost53OverloadsInfoUnion<(a: 1) => 2>> extends true ? TSPre53OverloadsInfoUnion<FunctionType> : TSPost53OverloadsInfoUnion<FunctionType>;
/**
 * Allows inferring any function using the `infer` keyword.
 */
type InferFunctionType<FunctionType extends (...args: any) => any> = FunctionType;
/**
 * A union type of the parameters allowed for any
 * overload of function {@linkcode FunctionType}.
 */
type OverloadParameters<FunctionType> = OverloadsInfoUnion<FunctionType> extends InferFunctionType<infer Fn> ? Parameters<Fn> : never;
/**
 * A union type of the return types for any overload of
 * function {@linkcode FunctionType}.
 */
type OverloadReturnTypes<FunctionType> = OverloadsInfoUnion<FunctionType> extends InferFunctionType<infer Fn> ? ReturnType<Fn> : never;
/**
 * Like {@linkcode TSPost53OverloadsInfoUnion} but extracts only the
 * `this` parameter types, using `(this: infer T, ...)` to preserve `this`
 * before it gets stripped.
 *
 * @template FunctionType - the function type to extract `this` parameter types from.
 */
type TSPost53OverloadThisParameterTypes<FunctionType> = FunctionType extends {
    (this: infer T1, ...args: any[]): any;
    (this: infer T2, ...args: any[]): any;
    (this: infer T3, ...args: any[]): any;
    (this: infer T4, ...args: any[]): any;
    (this: infer T5, ...args: any[]): any;
    (this: infer T6, ...args: any[]): any;
    (this: infer T7, ...args: any[]): any;
    (this: infer T8, ...args: any[]): any;
    (this: infer T9, ...args: any[]): any;
    (this: infer T10, ...args: any[]): any;
} ? T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10 : never;
/**
 * Like {@linkcode DecreasingOverloadsInfoUnion} but preserves the
 * `this` parameter in each extracted function variant so that it can be
 * used for filtering and `this` type extraction.
 *
 * @template FunctionType - the function type to extract overload info from.
 */
type DecreasingOverloadsInfoUnionWithThis<FunctionType> = FunctionType extends {
    (this: infer T1, ...args: infer A1): infer R1;
    (this: infer T2, ...args: infer A2): infer R2;
    (this: infer T3, ...args: infer A3): infer R3;
    (this: infer T4, ...args: infer A4): infer R4;
    (this: infer T5, ...args: infer A5): infer R5;
    (this: infer T6, ...args: infer A6): infer R6;
    (this: infer T7, ...args: infer A7): infer R7;
    (this: infer T8, ...args: infer A8): infer R8;
    (this: infer T9, ...args: infer A9): infer R9;
    (this: infer T10, ...args: infer A10): infer R10;
} ? ((this: T1, ...args: A1) => R1) | ((this: T2, ...args: A2) => R2) | ((this: T3, ...args: A3) => R3) | ((this: T4, ...args: A4) => R4) | ((this: T5, ...args: A5) => R5) | ((this: T6, ...args: A6) => R6) | ((this: T7, ...args: A7) => R7) | ((this: T8, ...args: A8) => R8) | ((this: T9, ...args: A9) => R9) | ((this: T10, ...args: A10) => R10) : FunctionType extends {
    (this: infer T1, ...args: infer A1): infer R1;
    (this: infer T2, ...args: infer A2): infer R2;
    (this: infer T3, ...args: infer A3): infer R3;
    (this: infer T4, ...args: infer A4): infer R4;
    (this: infer T5, ...args: infer A5): infer R5;
    (this: infer T6, ...args: infer A6): infer R6;
    (this: infer T7, ...args: infer A7): infer R7;
    (this: infer T8, ...args: infer A8): infer R8;
    (this: infer T9, ...args: infer A9): infer R9;
} ? ((this: T1, ...args: A1) => R1) | ((this: T2, ...args: A2) => R2) | ((this: T3, ...args: A3) => R3) | ((this: T4, ...args: A4) => R4) | ((this: T5, ...args: A5) => R5) | ((this: T6, ...args: A6) => R6) | ((this: T7, ...args: A7) => R7) | ((this: T8, ...args: A8) => R8) | ((this: T9, ...args: A9) => R9) : FunctionType extends {
    (this: infer T1, ...args: infer A1): infer R1;
    (this: infer T2, ...args: infer A2): infer R2;
    (this: infer T3, ...args: infer A3): infer R3;
    (this: infer T4, ...args: infer A4): infer R4;
    (this: infer T5, ...args: infer A5): infer R5;
    (this: infer T6, ...args: infer A6): infer R6;
    (this: infer T7, ...args: infer A7): infer R7;
    (this: infer T8, ...args: infer A8): infer R8;
} ? ((this: T1, ...args: A1) => R1) | ((this: T2, ...args: A2) => R2) | ((this: T3, ...args: A3) => R3) | ((this: T4, ...args: A4) => R4) | ((this: T5, ...args: A5) => R5) | ((this: T6, ...args: A6) => R6) | ((this: T7, ...args: A7) => R7) | ((this: T8, ...args: A8) => R8) : FunctionType extends {
    (this: infer T1, ...args: infer A1): infer R1;
    (this: infer T2, ...args: infer A2): infer R2;
    (this: infer T3, ...args: infer A3): infer R3;
    (this: infer T4, ...args: infer A4): infer R4;
    (this: infer T5, ...args: infer A5): infer R5;
    (this: infer T6, ...args: infer A6): infer R6;
    (this: infer T7, ...args: infer A7): infer R7;
} ? ((this: T1, ...args: A1) => R1) | ((this: T2, ...args: A2) => R2) | ((this: T3, ...args: A3) => R3) | ((this: T4, ...args: A4) => R4) | ((this: T5, ...args: A5) => R5) | ((this: T6, ...args: A6) => R6) | ((this: T7, ...args: A7) => R7) : FunctionType extends {
    (this: infer T1, ...args: infer A1): infer R1;
    (this: infer T2, ...args: infer A2): infer R2;
    (this: infer T3, ...args: infer A3): infer R3;
    (this: infer T4, ...args: infer A4): infer R4;
    (this: infer T5, ...args: infer A5): infer R5;
    (this: infer T6, ...args: infer A6): infer R6;
} ? ((this: T1, ...args: A1) => R1) | ((this: T2, ...args: A2) => R2) | ((this: T3, ...args: A3) => R3) | ((this: T4, ...args: A4) => R4) | ((this: T5, ...args: A5) => R5) | ((this: T6, ...args: A6) => R6) : FunctionType extends {
    (this: infer T1, ...args: infer A1): infer R1;
    (this: infer T2, ...args: infer A2): infer R2;
    (this: infer T3, ...args: infer A3): infer R3;
    (this: infer T4, ...args: infer A4): infer R4;
    (this: infer T5, ...args: infer A5): infer R5;
} ? ((this: T1, ...args: A1) => R1) | ((this: T2, ...args: A2) => R2) | ((this: T3, ...args: A3) => R3) | ((this: T4, ...args: A4) => R4) | ((this: T5, ...args: A5) => R5) : FunctionType extends {
    (this: infer T1, ...args: infer A1): infer R1;
    (this: infer T2, ...args: infer A2): infer R2;
    (this: infer T3, ...args: infer A3): infer R3;
    (this: infer T4, ...args: infer A4): infer R4;
} ? ((this: T1, ...args: A1) => R1) | ((this: T2, ...args: A2) => R2) | ((this: T3, ...args: A3) => R3) | ((this: T4, ...args: A4) => R4) : FunctionType extends {
    (this: infer T1, ...args: infer A1): infer R1;
    (this: infer T2, ...args: infer A2): infer R2;
    (this: infer T3, ...args: infer A3): infer R3;
} ? ((this: T1, ...args: A1) => R1) | ((this: T2, ...args: A2) => R2) | ((this: T3, ...args: A3) => R3) : FunctionType extends {
    (this: infer T1, ...args: infer A1): infer R1;
    (this: infer T2, ...args: infer A2): infer R2;
} ? ((this: T1, ...args: A1) => R1) | ((this: T2, ...args: A2) => R2) : FunctionType extends (this: infer T1, ...args: infer A1) => infer R1 ? (this: T1, ...args: A1) => R1 : never;
/**
 * Like {@linkcode TSPre53OverloadsInfoUnion} but extracts the
 * `this` parameter types, using
 * {@linkcode DecreasingOverloadsInfoUnionWithThis} to preserve `this`
 * through the filtering step.
 *
 * @template FunctionType - the function type to extract `this` parameter types from.
 */
type TSPre53OverloadThisParameterTypes<FunctionType> = Tuplify<DecreasingOverloadsInfoUnionWithThis<FunctionType>> extends infer TupleType ? TupleType extends [infer OverloadedFunctionType] ? IsUselessOverloadInfo<OverloadedFunctionType> extends true ? never : OverloadedFunctionType extends (this: infer InferredThisType, ...args: any[]) => any ? InferredThisType : never : never : never;
/**
 * A union type of the `this` parameter types for any overload of
 * function {@linkcode FunctionType}.
 *
 * @template FunctionType - the function type to extract `this` parameter types from.
 */
type OverloadThisParameterTypes<FunctionType> = FunctionType extends (...args: any[]) => any ? IsNever<TSPost53OverloadsInfoUnion<(a: 1) => 2>> extends true ? TSPre53OverloadThisParameterTypes<FunctionType> : TSPost53OverloadThisParameterTypes<FunctionType> : ThisParameterType<FunctionType>;
/**
 * Takes an overload variants {@linkcode Union},
 * produced from {@linkcode OverloadsInfoUnion} and rejects
 * the ones incompatible with parameters {@linkcode Args}.
 */
type SelectOverloadsInfo<Union extends UnknownFunction, Args extends unknown[]> = Union extends InferFunctionType<infer Fn> ? (Args extends Parameters<Fn> ? Fn : never) : never;
/**
 * Creates a new overload (an intersection type) from an existing one,
 * which only includes variant(s) which can accept
 * {@linkcode Args} as parameters.
 */
type OverloadsNarrowedByParameters<FunctionType, Args extends OverloadParameters<FunctionType>> = UnionToIntersection<SelectOverloadsInfo<OverloadsInfoUnion<FunctionType>, Args>>;
/**
 * The simple(ish) way to get overload info from a constructor
 * {@linkcode ConstructorType}. Recent versions of TypeScript will match any
 * constructor against a generic 10-overload type, filling in slots with
 * duplicates of the constructor. So, we can just match against a single type
 * and get all the overloads.
 *
 * For older versions of TypeScript,
 * we'll need to painstakingly do ten separate matches.
 */
type TSPost53ConstructorOverloadsInfoUnion<ConstructorType> = ConstructorType extends {
    new (...args: infer A1): infer R1;
    new (...args: infer A2): infer R2;
    new (...args: infer A3): infer R3;
    new (...args: infer A4): infer R4;
    new (...args: infer A5): infer R5;
    new (...args: infer A6): infer R6;
    new (...args: infer A7): infer R7;
    new (...args: infer A8): infer R8;
    new (...args: infer A9): infer R9;
    new (...args: infer A10): infer R10;
} ? (new (...p: A1) => R1) | (new (...p: A2) => R2) | (new (...p: A3) => R3) | (new (...p: A4) => R4) | (new (...p: A5) => R5) | (new (...p: A6) => R6) | (new (...p: A7) => R7) | (new (...p: A8) => R8) | (new (...p: A9) => R9) | (new (...p: A10) => R10) : never;
/**
 * A constructor function with `unknown` parameters and return type.
 */
type UnknownConstructor = new (...args: unknown[]) => unknown;
/**
 * Same as {@linkcode IsUselessOverloadInfo}, but for constructors.
 */
type IsUselessConstructorOverloadInfo<FunctionType> = StrictEqualUsingTSInternalIdenticalToOperator<FunctionType, UnknownConstructor>;
/**
 * For older versions of TypeScript, we need two separate workarounds to
 * get constructor overload info. First, we need need to use
 * {@linkcode DecreasingConstructorOverloadsInfoUnion} to get the overload
 * info for constructors with 1-10 overloads. Then, we need to filter out the
 * "useless" overloads that are present in older versions of TypeScript,
 * for parameterless constructors. To do this we use
 * {@linkcode IsUselessConstructorOverloadInfo} to remove useless overloads.
 *
 * @see {@link https://github.com/microsoft/TypeScript/issues/28867 | Related}
 */
type TSPre53ConstructorOverloadsInfoUnion<ConstructorType> = Tuplify<DecreasingConstructorOverloadsInfoUnion<ConstructorType>> extends infer Tup ? Tup extends [infer Ctor] ? IsUselessConstructorOverloadInfo<Ctor> extends true ? never : Ctor : never : never;
/**
 * For versions of TypeScript below 5.3, we need to check for 10 overloads,
 * then 9, then 8, etc., to get a union of the overload variants.
 */
type DecreasingConstructorOverloadsInfoUnion<ConstructorType> = ConstructorType extends {
    new (...args: infer A1): infer R1;
    new (...args: infer A2): infer R2;
    new (...args: infer A3): infer R3;
    new (...args: infer A4): infer R4;
    new (...args: infer A5): infer R5;
    new (...args: infer A6): infer R6;
    new (...args: infer A7): infer R7;
    new (...args: infer A8): infer R8;
    new (...args: infer A9): infer R9;
    new (...args: infer A10): infer R10;
} ? (new (...p: A1) => R1) | (new (...p: A2) => R2) | (new (...p: A3) => R3) | (new (...p: A4) => R4) | (new (...p: A5) => R5) | (new (...p: A6) => R6) | (new (...p: A7) => R7) | (new (...p: A8) => R8) | (new (...p: A9) => R9) | (new (...p: A10) => R10) : ConstructorType extends {
    new (...args: infer A1): infer R1;
    new (...args: infer A2): infer R2;
    new (...args: infer A3): infer R3;
    new (...args: infer A4): infer R4;
    new (...args: infer A5): infer R5;
    new (...args: infer A6): infer R6;
    new (...args: infer A7): infer R7;
    new (...args: infer A8): infer R8;
    new (...args: infer A9): infer R9;
} ? (new (...p: A1) => R1) | (new (...p: A2) => R2) | (new (...p: A3) => R3) | (new (...p: A4) => R4) | (new (...p: A5) => R5) | (new (...p: A6) => R6) | (new (...p: A7) => R7) | (new (...p: A8) => R8) | (new (...p: A9) => R9) : ConstructorType extends {
    new (...args: infer A1): infer R1;
    new (...args: infer A2): infer R2;
    new (...args: infer A3): infer R3;
    new (...args: infer A4): infer R4;
    new (...args: infer A5): infer R5;
    new (...args: infer A6): infer R6;
    new (...args: infer A7): infer R7;
    new (...args: infer A8): infer R8;
} ? (new (...p: A1) => R1) | (new (...p: A2) => R2) | (new (...p: A3) => R3) | (new (...p: A4) => R4) | (new (...p: A5) => R5) | (new (...p: A6) => R6) | (new (...p: A7) => R7) | (new (...p: A8) => R8) : ConstructorType extends {
    new (...args: infer A1): infer R1;
    new (...args: infer A2): infer R2;
    new (...args: infer A3): infer R3;
    new (...args: infer A4): infer R4;
    new (...args: infer A5): infer R5;
    new (...args: infer A6): infer R6;
    new (...args: infer A7): infer R7;
} ? (new (...p: A1) => R1) | (new (...p: A2) => R2) | (new (...p: A3) => R3) | (new (...p: A4) => R4) | (new (...p: A5) => R5) | (new (...p: A6) => R6) | (new (...p: A7) => R7) : ConstructorType extends {
    new (...args: infer A1): infer R1;
    new (...args: infer A2): infer R2;
    new (...args: infer A3): infer R3;
    new (...args: infer A4): infer R4;
    new (...args: infer A5): infer R5;
    new (...args: infer A6): infer R6;
} ? (new (...p: A1) => R1) | (new (...p: A2) => R2) | (new (...p: A3) => R3) | (new (...p: A4) => R4) | (new (...p: A5) => R5) | (new (...p: A6) => R6) : ConstructorType extends {
    new (...args: infer A1): infer R1;
    new (...args: infer A2): infer R2;
    new (...args: infer A3): infer R3;
    new (...args: infer A4): infer R4;
    new (...args: infer A5): infer R5;
} ? (new (...p: A1) => R1) | (new (...p: A2) => R2) | (new (...p: A3) => R3) | (new (...p: A4) => R4) | (new (...p: A5) => R5) : ConstructorType extends {
    new (...args: infer A1): infer R1;
    new (...args: infer A2): infer R2;
    new (...args: infer A3): infer R3;
    new (...args: infer A4): infer R4;
} ? (new (...p: A1) => R1) | (new (...p: A2) => R2) | (new (...p: A3) => R3) | (new (...p: A4) => R4) : ConstructorType extends {
    new (...args: infer A1): infer R1;
    new (...args: infer A2): infer R2;
    new (...args: infer A3): infer R3;
} ? (new (...p: A1) => R1) | (new (...p: A2) => R2) | (new (...p: A3) => R3) : ConstructorType extends {
    new (...args: infer A1): infer R1;
    new (...args: infer A2): infer R2;
} ? (new (...p: A1) => R1) | (new (...p: A2) => R2) : ConstructorType extends new (...args: infer A1) => infer R1 ? (new (...p: A1) => R1) : never;
/**
 * Get a union of overload variants for a constructor
 * {@linkcode ConstructorType}. Does a check for whether we can do the
 * one-shot 10-overload matcher (which works for ts\>5.3), and if not,
 * falls back to the more complicated utility.
 */
type ConstructorOverloadsUnion<ConstructorType> = IsNever<TSPost53ConstructorOverloadsInfoUnion<new (a: 1) => any>> extends true ? TSPre53ConstructorOverloadsInfoUnion<ConstructorType> : TSPost53ConstructorOverloadsInfoUnion<ConstructorType>;
/**
 * Allows inferring any constructor using the `infer` keyword.
 */
type InferConstructor<ConstructorType extends new (...args: any) => any> = ConstructorType;
/**
 * A union type of the parameters allowed for any overload
 * of constructor {@linkcode ConstructorType}.
 */
type ConstructorOverloadParameters<ConstructorType> = ConstructorOverloadsUnion<ConstructorType> extends InferConstructor<infer Ctor> ? ConstructorParameters<Ctor> : never;
/**
 * Calculates the number of overloads for a given function type.
 */
type NumOverloads<FunctionType> = UnionToTuple<OverloadsInfoUnion<FunctionType>>['length'];

type DeepBrandOptions = {
    nominalTypes: {};
};
type DeepBrandOptionsDefaults = {
    nominalTypes: {
        Date: Date;
    };
};
type NominalType<T, Options extends DeepBrandOptions> = Options['nominalTypes'] extends infer N ? {
    [K in keyof N]: MutuallyExtends<N[K], T> extends true ? K : never;
}[keyof N] : never;
/**
 * Represents a deeply branded type.
 *
 * Recursively walk a type and replace it with a branded type related to the
 * original. This is useful for equality-checking stricter than
 * `A extends B ? B extends A ? true : false : false`, because it detects the
 * difference between a few edge-case types that vanilla TypeScript
 * doesn't by default:
 * - `any` vs `unknown`
 * - `{ readonly a: string }` vs `{ a: string }`
 * - `{ a?: string }` vs `{ a: string | undefined }`
 *
 * __Note__: not very performant for complex types - this should only be used
 * when you know you need it. If doing an equality check, it's almost always
 * better to use {@linkcode StrictEqualUsingTSInternalIdenticalToOperator}.
 */
type DeepBrand<T, Options extends DeepBrandOptions> = IsNever<T> extends true ? {
    type: 'never';
} : IsAny<T> extends true ? {
    type: 'any';
} : IsUnknown<T> extends true ? {
    type: 'unknown';
} : NominalType<T, Options> extends infer Nominal ? IsNever<Nominal> extends true ? T extends string | number | boolean | symbol | bigint | null | undefined | void ? {
    type: 'primitive';
    value: T;
} : T extends new (...args: any[]) => any ? {
    type: 'constructor';
    params: ConstructorOverloadParameters<T>;
    instance: DeepBrand<InstanceType<Extract<T, new (...args: any) => any>>, Options>;
} : T extends (...args: infer P) => infer R ? NumOverloads<T> extends 1 ? {
    type: 'function';
    params: DeepBrand<P, Options>;
    return: DeepBrand<R, Options>;
    this: DeepBrand<ThisParameterType<T>, Options>;
    props: DeepBrand<Omit<T, keyof Function>, Options>;
} : UnionToTuple<OverloadsInfoUnion<T>> extends infer OverloadsTuple ? {
    type: 'overloads';
    overloads: {
        [K in keyof OverloadsTuple]: DeepBrand<OverloadsTuple[K], Options>;
    };
} : never : T extends any[] ? IsTuple<T> extends true ? {
    type: 'tuple';
    items: {
        [K in keyof T]: DeepBrand<T[K], Options>;
    };
} : {
    type: 'array';
    items: DeepBrand<T[number], Options>;
} : IsRecord<T> extends true ? {
    type: 'record';
    keys: keyof T;
    values: DeepBrand<T[keyof T], Options>;
} : {
    type: 'object';
    properties: {
        [K in keyof T]: DeepBrand<T[K], Options>;
    };
    readonly: ReadonlyKeys<T>;
    required: RequiredKeys<T>;
    optional: OptionalKeys<T>;
    constructorParams: ConstructorOverloadParameters<T> extends infer P ? IsNever<P> extends true ? never : DeepBrand<P, Options> : never;
} : {
    type: Nominal;
} : never;
/**
 * Checks if two types are strictly equal using branding.
 */
type StrictEqualUsingBranding<Left, Right, Options extends DeepBrandOptions> = MutuallyExtends<DeepBrand<Left, Options>, DeepBrand<Right, Options>>;
/**
 * @internal don't use this unless you are deeply familiar with it!
 *
 * Walks over a type `T`, assuming that it's the output of the {@linkcode DeepBrand} utility. It looks for leaf nodes looking like `{type: FindType}`.
 * When it finds them, it merges them into a string->string record, keeping track of a rough representation of the path-location.
 * For simple objects, this path will roughly match dot-prop notation but it also traverses into all the structures that `DeepBrand` can emit.
 * But it also goes into overloads, function parameters, return types, etc. The output is an ugly intersection of objects along with a marker `{deepBrandLeafNode: true}`
 * which is purely for internal use. The output should not be shown to end-users!
 */
type _DeepPropTypesOfBranded<T, PathTo extends string, FindType extends string> = IsNever<T> extends true ? {} : T extends string ? {} : T extends {
    type: FindType;
} ? {
    [K in PathTo]: T['type'];
} & {
    deepBrandLeafNode: true;
} : T extends any[] ? _DeepPropTypesOfBranded<TupleToRecord<T>, PathTo, FindType> : UnionToIntersection<{
    [K in keyof T]: Extract<_DeepPropTypesOfBranded<T[K], `${PathTo}${DeepBrandPropPathSuffix<T, Prop<K>>}`, FindType>, {
        deepBrandLeafNode: true;
    }>;
}[keyof T]>;
/** Required options for for {@linkcode DeepBrandPropNotes}. */
type DeepBrandPropNotesOptions = Partial<DeepBrandOptions> & {
    findType: 'any' | 'never' | 'unknown';
};
/** Default options for for {@linkcode DeepBrandPropNotes}. */
type DeepBrandPropNotesOptionsDefaults = {
    findType: 'any' | 'never';
};
/**
 * For an input type `T`, finds all deeply-nested properties in the {@linkcode DeepBrand} representation of it.
 *
 * The output is a developer-readable shallow record of prop-path -> resolved type.
 * @example
 * ```ts
 * type X = {a: any; b: boolean; c: {d: any}}
 * const notes: DeepBrandPropNotes<X, {findType: 'any'}> = {
 *   '.a': 'any',
 *   '.c.d': 'any',
 * }
 * ```
 */
type DeepBrandPropNotes<T, Options extends DeepBrandPropNotesOptions> = _DeepPropTypesOfBranded<DeepBrand<T, DeepBrandOptionsDefaults & Options>, '', Options['findType']> extends infer X ? {} extends X ? Record<string | number | symbol, 'No flagged props found!'> : {
    [K in Exclude<keyof X, 'deepBrandLeafNode'>]: X[K];
} : never;
/**
 * @internal
 *
 * Helper to coerce a type `K` that you are already pretty sure is a string because it camed from a `keyof T` type expression.
 * Useful because sometimes TypeScript forgets that.
 * When it's not a string or number, it will output a big ugly literal type `'UNEXPECTED_NON_LITERAL_PROP'` - try to avoid this!
 */
type Prop<K> = K extends string | number ? K : 'UNEXPECTED_NON_LITERAL_PROP';
/**
 * Gets a sensible suffix to a property path for a {@linkcode DeepBrand} output type.
 * `[number]` for arrays, empty string for objects, and parenthesised-input for anything else.
 */
type DeepBrandPropPathSuffix<T, K> = T extends {
    type: string;
} ? K extends 'items' ? '[number]' : K extends 'properties' ? '' : `(${Prop<K>})` : `.${Prop<K>}`;

/**
 * Determines the printable type representation for a given type.
 */
type PrintType<T> = IsUnknown<T> extends true ? 'unknown' : IsNever<T> extends true ? 'never' : IsAny<T> extends true ? never : boolean extends T ? 'boolean' : T extends boolean ? `literal boolean: ${T}` : string extends T ? 'string' : T extends string ? `literal string: ${T}` : number extends T ? 'number' : T extends number ? `literal number: ${T}` : bigint extends T ? 'bigint' : T extends bigint ? `literal bigint: ${T}` : T extends null ? 'null' : T extends undefined ? 'undefined' : T extends (...args: any[]) => any ? 'function' : '...';
/**
 * Helper for showing end-user a hint why their type assertion is failing.
 * This swaps "leaf" types with a literal message about what the actual and
 * expected types are. Needs to check for `Not<IsAny<Actual>>` because
 * otherwise `LeafTypeOf<Actual>` returns `never`, which extends everything 🤔
 */
type MismatchInfo<Actual, Expected, Options extends DeepBrandOptions = DeepBrandOptionsDefaults> = And<[Extends<PrintType<Actual>, '...'>, Not<IsAny<Actual>>]> extends true ? And<[Extends<any[], Actual>, Extends<any[], Expected>]> extends true ? Array<MismatchInfo<Extract<Actual, any[]>[number], Extract<Expected, any[]>[number], Options>> : Optionalify<{
    [K in UsefulKeys<Actual> | UsefulKeys<Expected>]: MismatchInfo<K extends keyof Actual ? Actual[K] : never, K extends keyof Expected ? Expected[K] : never, Options>;
}, OptionalKeys<Expected>> : StrictEqualUsingBranding<Actual, Expected, Options> extends true ? Actual : `Expected: ${PrintType<Expected>}, Actual: ${PrintType<Exclude<Actual, Expected>>}`;
/**
 * Helper for making some keys of a type optional. Only useful so far for `MismatchInfo` - it makes sure we
 * don't get bogus errors about optional properties mismatching, when actually it's something else that's wrong.
 *
 * - Note: this helper is a no-op if there are no optional keys in the type.
 */
type Optionalify<T, TOptionalKeys> = [TOptionalKeys] extends [never] ? T : ({
    [K in Exclude<keyof T, TOptionalKeys>]: T[K];
} & {
    [K in Extract<keyof T, TOptionalKeys>]?: T[K];
}) extends infer X ? {
    [K in keyof X]: X[K];
} : never;
/**
 * @internal
 */
declare const inverted: unique symbol;
/**
 * @internal
 */
type Inverted<T> = {
    [inverted]: T;
};
/**
 * @internal
 */
declare const expectNull: unique symbol;
type ExpectNull<T> = {
    [expectNull]: T;
    result: ExtendsExcludingAnyOrNever<T, null>;
};
/**
 * @internal
 */
declare const expectUndefined: unique symbol;
type ExpectUndefined<T> = {
    [expectUndefined]: T;
    result: ExtendsExcludingAnyOrNever<T, undefined>;
};
/**
 * @internal
 */
declare const expectNumber: unique symbol;
type ExpectNumber<T> = {
    [expectNumber]: T;
    result: ExtendsExcludingAnyOrNever<T, number>;
};
/**
 * @internal
 */
declare const expectString: unique symbol;
type ExpectString<T> = {
    [expectString]: T;
    result: ExtendsExcludingAnyOrNever<T, string>;
};
/**
 * @internal
 */
declare const expectBoolean: unique symbol;
type ExpectBoolean<T> = {
    [expectBoolean]: T;
    result: ExtendsExcludingAnyOrNever<T, boolean>;
};
/**
 * @internal
 */
declare const expectVoid: unique symbol;
type ExpectVoid<T> = {
    [expectVoid]: T;
    result: ExtendsExcludingAnyOrNever<T, void>;
};
/**
 * @internal
 */
declare const expectFunction: unique symbol;
type ExpectFunction<T> = {
    [expectFunction]: T;
    result: ExtendsExcludingAnyOrNever<T, (...args: any[]) => any>;
};
/**
 * @internal
 */
declare const expectObject: unique symbol;
type ExpectObject<T> = {
    [expectObject]: T;
    result: ExtendsExcludingAnyOrNever<T, object>;
};
/**
 * @internal
 */
declare const expectArray: unique symbol;
type ExpectArray<T> = {
    [expectArray]: T;
    result: ExtendsExcludingAnyOrNever<T, any[]>;
};
/**
 * @internal
 */
declare const expectSymbol: unique symbol;
type ExpectSymbol<T> = {
    [expectSymbol]: T;
    result: ExtendsExcludingAnyOrNever<T, symbol>;
};
/**
 * @internal
 */
declare const expectAny: unique symbol;
type ExpectAny<T> = {
    [expectAny]: T;
    result: IsAny<T>;
};
/**
 * @internal
 */
declare const expectUnknown: unique symbol;
type ExpectUnknown<T> = {
    [expectUnknown]: T;
    result: IsUnknown<T>;
};
/**
 * @internal
 */
declare const expectNever: unique symbol;
type ExpectNever<T> = {
    [expectNever]: T;
    result: IsNever<T>;
};
/**
 * @internal
 */
declare const expectNullable: unique symbol;
type ExpectNullable<T> = {
    [expectNullable]: T;
    result: Not<StrictEqualUsingTSInternalIdenticalToOperator<T, NonNullable<T>>>;
};
/**
 * @internal
 */
declare const expectBigInt: unique symbol;
type ExpectBigInt<T> = {
    [expectBigInt]: T;
    result: ExtendsExcludingAnyOrNever<T, bigint>;
};
/**
 * Checks if the result of an expecter matches the specified options, and
 * resolves to a fairly readable error message if not.
 */
type Scolder<Expecter extends {
    result: boolean;
}, Options extends {
    positive: boolean;
}> = Expecter['result'] extends Options['positive'] ? () => true : Options['positive'] extends true ? Expecter : Inverted<Expecter>;

/**
 * Represents the positive assertion methods available for type checking in the
 * {@linkcode expectTypeOf()} utility.
 */
interface PositiveExpectTypeOf<Actual> extends BaseExpectTypeOf<Actual, {
    positive: true;
    branded: false;
}> {
    /**
     * Similar to jest's `expect(...).toMatchObject(...)` but for types.
     * Deeply "picks" the properties of the actual type based on the expected type, then performs a strict check to make sure the types match `Expected`.
     *
     * **Note**: optional properties on the {@linkcode Expected | expected type} are not allowed to be missing on the {@linkcode Actual | actual type}.
     *
     * @example
     * ```ts
     * expectTypeOf({ a: 1, b: 1 }).toMatchObjectType<{ a: number }>()
     *
     * expectTypeOf({ a: 1, b: 1 }).not.toMatchObjectType<{ a: number; c?: number }>()
     * ```
     *
     * @param MISMATCH - The mismatch arguments.
     * @returns `true`.
     */
    toMatchObjectType: <Expected extends IsUnion<Expected> extends true ? 'toMatchObject does not support union types' : Not<Extends<Expected, Record<string, unknown>>> extends true ? 'toMatchObject only supports object types' : StrictEqualUsingTSInternalIdenticalToOperator<DeepPickMatchingProps<Actual, Expected>, Expected> extends true ? unknown : MismatchInfo<DeepPickMatchingProps<Actual, Expected>, Expected>>(...MISMATCH: MismatchArgs<StrictEqualUsingTSInternalIdenticalToOperator<DeepPickMatchingProps<Actual, Expected>, Expected>, true>) => true;
    /**
     * Check if your type extends the expected type
     *
     * A less strict version of {@linkcode toEqualTypeOf | .toEqualTypeOf()} that allows for extra properties.
     * This is roughly equivalent to an `extends` constraint in a function type argument.
     *
     * @example
     * ```ts
     * expectTypeOf({ a: 1, b: 1 }).toExtend<{ a: number }>()
     *
     * expectTypeOf({ a: 1 }).not.toExtend<{ b: number }>()
     * ```
     *
     * @param MISMATCH - The mismatch arguments.
     * @returns `true`.
     */
    toExtend: <Expected extends Extends<Actual, Expected> extends true ? unknown : MismatchInfo<Actual, Expected>>(...MISMATCH: MismatchArgs<Extends<Actual, Expected>, true>) => true;
    toEqualTypeOf: {
        /**
         * Uses TypeScript's internal technique to check for type "identicalness".
         *
         * It will check if the types are fully equal to each other.
         * It will not fail if two objects have different values, but the same type.
         * It will fail however if an object is missing a property.
         *
         * **_Unexpected failure_**? For a more permissive but less performant
         * check that accommodates for equivalent intersection types,
         * use {@linkcode branded | .branded.toEqualTypeOf()}.
         * @see {@link https://github.com/mmkal/expect-type#why-is-my-assertion-failing | The documentation for details}.
         *
         * @example
         * <caption>Using generic type argument syntax</caption>
         * ```ts
         * expectTypeOf({ a: 1 }).toEqualTypeOf<{ a: number }>()
         *
         * expectTypeOf({ a: 1, b: 1 }).not.toEqualTypeOf<{ a: number }>()
         * ```
         *
         * @example
         * <caption>Using inferred type syntax by passing a value</caption>
         * ```ts
         * expectTypeOf({ a: 1 }).toEqualTypeOf({ a: 1 })
         *
         * expectTypeOf({ a: 1 }).toEqualTypeOf({ a: 2 })
         * ```
         *
         * @param value - The value to compare against the expected type.
         * @param MISMATCH - The mismatch arguments.
         * @returns `true`.
         */
        <Expected extends StrictEqualUsingTSInternalIdenticalToOperator<Actual, Expected> extends true ? unknown : MismatchInfo<Actual, Expected>>(value: Expected & AValue, // reason for `& AValue`: make sure this is only the selected overload when the end-user passes a value for an inferred typearg. The `Mismatch` type does match `AValue`.
        ...MISMATCH: MismatchArgs<StrictEqualUsingTSInternalIdenticalToOperator<Actual, Expected>, true>): true;
        /**
         * Uses TypeScript's internal technique to check for type "identicalness".
         *
         * It will check if the types are fully equal to each other.
         * It will not fail if two objects have different values, but the same type.
         * It will fail however if an object is missing a property.
         *
         * **_Unexpected failure_**? For a more permissive but less performant
         * check that accommodates for equivalent intersection types,
         * use {@linkcode branded | .branded.toEqualTypeOf()}.
         * @see {@link https://github.com/mmkal/expect-type#why-is-my-assertion-failing | The documentation for details}.
         *
         * @example
         * <caption>Using generic type argument syntax</caption>
         * ```ts
         * expectTypeOf({ a: 1 }).toEqualTypeOf<{ a: number }>()
         *
         * expectTypeOf({ a: 1, b: 1 }).not.toEqualTypeOf<{ a: number }>()
         * ```
         *
         * @example
         * <caption>Using inferred type syntax by passing a value</caption>
         * ```ts
         * expectTypeOf({ a: 1 }).toEqualTypeOf({ a: 1 })
         *
         * expectTypeOf({ a: 1 }).toEqualTypeOf({ a: 2 })
         * ```
         *
         * @param MISMATCH - The mismatch arguments.
         * @returns `true`.
         */
        <Expected extends StrictEqualUsingTSInternalIdenticalToOperator<Actual, Expected> extends true ? unknown : MismatchInfo<Actual, Expected>>(...MISMATCH: MismatchArgs<StrictEqualUsingTSInternalIdenticalToOperator<Actual, Expected>, true>): true;
    };
    /**
     * @deprecated Since v1.2.0 - Use either {@linkcode toMatchObjectType} or {@linkcode toExtend} instead
     *
     * - Use {@linkcode toMatchObjectType} to perform a strict check on a subset of your type's keys
     * - Use {@linkcode toExtend} to check if your type extends the expected type
     */
    toMatchTypeOf: {
        /**
         * @deprecated Since v1.2.0 - Use either {@linkcode toMatchObjectType} or {@linkcode toExtend} instead
         *
         * - Use {@linkcode toMatchObjectType} to perform a strict check on a subset of your type's keys
         * - Use {@linkcode toExtend} to check if your type extends the expected type
         *
         * A less strict version of {@linkcode toEqualTypeOf | .toEqualTypeOf()}
         * that allows for extra properties.
         * This is roughly equivalent to an `extends` constraint
         * in a function type argument.
         *
         * @example
         * <caption>Using generic type argument syntax</caption>
         * ```ts
         * expectTypeOf({ a: 1, b: 1 }).toMatchTypeOf<{ a: number }>()
         * ```
         *
         * @example
         * <caption>Using inferred type syntax by passing a value</caption>
         * ```ts
         * expectTypeOf({ a: 1, b: 1 }).toMatchTypeOf({ a: 2 })
         * ```
         *
         * @param value - The value to compare against the expected type.
         * @param MISMATCH - The mismatch arguments.
         * @returns `true`.
         */
        <Expected extends Extends<Actual, Expected> extends true ? unknown : MismatchInfo<Actual, Expected>>(value: Expected & AValue, // reason for `& AValue`: make sure this is only the selected overload when the end-user passes a value for an inferred typearg. The `Mismatch` type does match `AValue`.
        ...MISMATCH: MismatchArgs<Extends<Actual, Expected>, true>): true;
        /**
         * @deprecated Since v1.2.0 - Use either {@linkcode toMatchObjectType} or {@linkcode toExtend} instead
         *
         * - Use {@linkcode toMatchObjectType} to perform a strict check on a subset of your type's keys
         * - Use {@linkcode toExtend} to check if your type extends the expected type
         *
         * A less strict version of {@linkcode toEqualTypeOf | .toEqualTypeOf()}
         * that allows for extra properties.
         * This is roughly equivalent to an `extends` constraint
         * in a function type argument.
         *
         * @example
         * <caption>Using generic type argument syntax</caption>
         * ```ts
         * expectTypeOf({ a: 1, b: 1 }).toMatchTypeOf<{ a: number }>()
         * ```
         *
         * @example
         * <caption>Using inferred type syntax by passing a value</caption>
         * ```ts
         * expectTypeOf({ a: 1, b: 1 }).toMatchTypeOf({ a: 2 })
         * ```
         *
         * @param MISMATCH - The mismatch arguments.
         * @returns `true`.
         */
        <Expected extends Extends<Actual, Expected> extends true ? unknown : MismatchInfo<Actual, Expected>>(...MISMATCH: MismatchArgs<Extends<Actual, Expected>, true>): true;
    };
    /**
     * Checks whether an object has a given property.
     *
     * @example
     * <caption>check that properties exist</caption>
     * ```ts
     * const obj = { a: 1, b: '' }
     *
     * expectTypeOf(obj).toHaveProperty('a')
     *
     * expectTypeOf(obj).not.toHaveProperty('c')
     * ```
     *
     * @param key - The property key to check for.
     * @param MISMATCH - The mismatch arguments.
     * @returns `true`.
     */
    toHaveProperty: <KeyType extends keyof Actual>(key: KeyType, ...MISMATCH: MismatchArgs<Extends<KeyType, keyof Actual>, true>) => KeyType extends keyof Actual ? PositiveExpectTypeOf<Actual[KeyType]> : true;
    /**
     * Inverts the result of the following assertions.
     *
     * @example
     * ```ts
     * expectTypeOf({ a: 1 }).not.toMatchTypeOf({ b: 1 })
     * ```
     */
    not: NegativeExpectTypeOf<Actual>;
    /**
     * Intersection types can cause issues with
     * {@linkcode toEqualTypeOf | .toEqualTypeOf()}:
     * ```ts
     * // ❌ The following line doesn't compile, even though the types are arguably the same.
     * expectTypeOf<{ a: 1 } & { b: 2 }>().toEqualTypeOf<{ a: 1; b: 2 }>()
     * ```
     * This helper works around this problem by using
     * a more permissive but less performant check.
     *
     * __Note__: This comes at a performance cost, and can cause the compiler
     * to 'give up' if used with excessively deep types, so use sparingly.
     *
     * @see {@link https://github.com/mmkal/expect-type/pull/21 | Reference}
     */
    branded: Branded<Actual, DeepBrandOptionsDefaults>;
}
interface Branded<Actual, Options extends DeepBrandOptions> {
    /**
     * Uses TypeScript's internal technique to check for type "identicalness".
     *
     * It will check if the types are fully equal to each other.
     * It will not fail if two objects have different values, but the same type.
     * It will fail however if an object is missing a property.
     *
     * **_Unexpected failure_**? For a more permissive but less performant
     * check that accommodates for equivalent intersection types,
     * use {@linkcode PositiveExpectTypeOf.branded | .branded.toEqualTypeOf()}.
     * @see {@link https://github.com/mmkal/expect-type#why-is-my-assertion-failing | The documentation for details}.
     *
     * @example
     * <caption>Using generic type argument syntax</caption>
     * ```ts
     * expectTypeOf({ a: 1 }).toEqualTypeOf<{ a: number }>()
     *
     * expectTypeOf({ a: 1, b: 1 }).not.toEqualTypeOf<{ a: number }>()
     * ```
     *
     * @example
     * <caption>Using inferred type syntax by passing a value</caption>
     * ```ts
     * expectTypeOf({ a: 1 }).toEqualTypeOf({ a: 1 })
     *
     * expectTypeOf({ a: 1 }).toEqualTypeOf({ a: 2 })
     * ```
     *
     * @param MISMATCH - The mismatch arguments.
     * @returns `true`.
     */
    toEqualTypeOf: <Expected extends StrictEqualUsingBranding<Actual, Expected, Options> extends true ? unknown : MismatchInfo<Actual, Expected, Options>>(...MISMATCH: MismatchArgs<StrictEqualUsingBranding<Actual, Expected, Options>, true>) => true;
    /**
     * Walk a type to find every deeply-nested path that resolves to `any` or `never`, useful for catching
     * badly-defined types hiding inside large or complex objects.
     *
     * Pass `{foundProps: {}}` to assert there are none - a type error will list the offending paths if there are.
     * Otherwise pass `foundProps` as a record of `path -> flagged type` to acknowledge the ones you expect.
     * The compiler tells you the exact paths (and what they resolve to) if you get it wrong.
     *
     * Use the `findType` type argument to search for `'any'`, `'never'`, or `'unknown'` instead of the default (`'any' | 'never'`).
     *
     * @param params An object with a `foundProps` record mapping each flagged path to its resolved type. For a
     * well-defined type with no issues, pass `{foundProps: {}}`.
     * @returns true
     *
     * @example
     * ```ts
     * type BadType = {a: any; nested: {b: never}; list: Array<{c: any}>}
     *
     * // \@ts-expect-error there are `any`/`never` paths, so you can't claim there are none.
     * expectTypeOf<BadType>().branded.inspect({foundProps: {}})
     *
     * // ...instead, enumerate them (the compiler reports the exact paths if this is wrong):
     * expectTypeOf<BadType>().branded.inspect({
     *   foundProps: {
     *     '.a': 'any',
     *     '.nested.b': 'never',
     *     '.list[number].c': 'any',
     *   },
     * })
     * ```
     *
     * @example
     * ```ts
     * type GoodType = {b: boolean; c: string}
     *
     * expectTypeOf<GoodType>().branded.inspect({foundProps: {}})
     * ```
     *
     * @example
     * ```ts
     * // search for `unknown` instead of `any`/`never`:
     * expectTypeOf<{u: unknown}>().branded.inspect<{findType: 'unknown'}>({foundProps: {'.u': 'unknown'}})
     * ```
     */
    inspect: <PropNoteOptions extends Exclude<DeepBrandPropNotesOptions, DeepBrandOptions> = DeepBrandPropNotesOptionsDefaults>(params: {
        foundProps: DeepBrandPropNotes<Actual, Options & PropNoteOptions>;
    }) => true;
    configure<O extends DeepBrandOptions>(): Branded<Actual, O>;
}
/**
 * Represents the negative expectation type for the {@linkcode Actual} type.
 */
interface NegativeExpectTypeOf<Actual> extends BaseExpectTypeOf<Actual, {
    positive: false;
}> {
    /**
     * Similar to jest's `expect(...).toMatchObject(...)` but for types.
     * Deeply "picks" the properties of the actual type based on the expected type, then performs a strict check to make sure the types match `Expected`.
     *
     * **Note**: optional properties on the {@linkcode Expected | expected type} are not allowed to be missing on the {@linkcode Actual | actual type}.
     *
     * @example
     * ```ts
     * expectTypeOf({ a: 1, b: 1 }).toMatchObjectType<{ a: number }>()
     *
     * expectTypeOf({ a: 1, b: 1 }).not.toMatchObjectType<{ a: number; c?: number }>()
     * ```
     *
     * @param MISMATCH - The mismatch arguments.
     * @returns `true`.
     */
    toMatchObjectType: <Expected>(...MISMATCH: MismatchArgs<StrictEqualUsingTSInternalIdenticalToOperator<Pick<Actual, keyof Actual & keyof Expected>, Expected>, false>) => true;
    /**
     * Check if your type extends the expected type
     *
     * A less strict version of {@linkcode PositiveExpectTypeOf.toEqualTypeOf | .toEqualTypeOf()} that allows for extra properties.
     * This is roughly equivalent to an `extends` constraint in a function type argument.
     *
     * @example
     * ```ts
     * expectTypeOf({ a: 1, b: 1 }).toExtend<{ a: number }>()]
     *
     * expectTypeOf({ a: 1 }).not.toExtend<{ b: number }>()
     * ```
     *
     * @param MISMATCH - The mismatch arguments.
     * @returns `true`.
     */
    toExtend<Expected>(...MISMATCH: MismatchArgs<Extends<Actual, Expected>, false>): true;
    toEqualTypeOf: {
        /**
         * Uses TypeScript's internal technique to check for type "identicalness".
         *
         * It will check if the types are fully equal to each other.
         * It will not fail if two objects have different values, but the same type.
         * It will fail however if an object is missing a property.
         *
         * **_Unexpected failure_**? For a more permissive but less performant
         * check that accommodates for equivalent intersection types,
         * use {@linkcode PositiveExpectTypeOf.branded | .branded.toEqualTypeOf()}.
         * @see {@link https://github.com/mmkal/expect-type#why-is-my-assertion-failing | The documentation for details}.
         *
         * @example
         * <caption>Using generic type argument syntax</caption>
         * ```ts
         * expectTypeOf({ a: 1 }).toEqualTypeOf<{ a: number }>()
         *
         * expectTypeOf({ a: 1, b: 1 }).not.toEqualTypeOf<{ a: number }>()
         * ```
         *
         * @example
         * <caption>Using inferred type syntax by passing a value</caption>
         * ```ts
         * expectTypeOf({ a: 1 }).toEqualTypeOf({ a: 1 })
         *
         * expectTypeOf({ a: 1 }).toEqualTypeOf({ a: 2 })
         * ```
         *
         * @param value - The value to compare against the expected type.
         * @param MISMATCH - The mismatch arguments.
         * @returns `true`.
         */
        <Expected>(value: Expected & AValue, ...MISMATCH: MismatchArgs<StrictEqualUsingTSInternalIdenticalToOperator<Actual, Expected>, false>): true;
        /**
         * Uses TypeScript's internal technique to check for type "identicalness".
         *
         * It will check if the types are fully equal to each other.
         * It will not fail if two objects have different values, but the same type.
         * It will fail however if an object is missing a property.
         *
         * **_Unexpected failure_**? For a more permissive but less performant
         * check that accommodates for equivalent intersection types,
         * use {@linkcode PositiveExpectTypeOf.branded | .branded.toEqualTypeOf()}.
         * @see {@link https://github.com/mmkal/expect-type#why-is-my-assertion-failing | The documentation for details}.
         *
         * @example
         * <caption>Using generic type argument syntax</caption>
         * ```ts
         * expectTypeOf({ a: 1 }).toEqualTypeOf<{ a: number }>()
         *
         * expectTypeOf({ a: 1, b: 1 }).not.toEqualTypeOf<{ a: number }>()
         * ```
         *
         * @example
         * <caption>Using inferred type syntax by passing a value</caption>
         * ```ts
         * expectTypeOf({ a: 1 }).toEqualTypeOf({ a: 1 })
         *
         * expectTypeOf({ a: 1 }).toEqualTypeOf({ a: 2 })
         * ```
         *
         * @param MISMATCH - The mismatch arguments.
         * @returns `true`.
         */
        <Expected>(...MISMATCH: MismatchArgs<StrictEqualUsingTSInternalIdenticalToOperator<Actual, Expected>, false>): true;
    };
    /**
     * @deprecated Since v1.2.0 - Use either {@linkcode toMatchObjectType} or {@linkcode toExtend} instead
     *
     * - Use {@linkcode toMatchObjectType} to perform a strict check on a subset of your type's keys
     * - Use {@linkcode toExtend} to check if your type extends the expected type
     */
    toMatchTypeOf: {
        /**
         * @deprecated Since v1.2.0 - Use either {@linkcode toMatchObjectType} or {@linkcode toExtend} instead
         *
         * - Use {@linkcode toMatchObjectType} to perform a strict check on a subset of your type's keys
         * - Use {@linkcode toExtend} to check if your type extends the expected type
         *
         * A less strict version of
         * {@linkcode PositiveExpectTypeOf.toEqualTypeOf | .toEqualTypeOf()}
         * that allows for extra properties.
         * This is roughly equivalent to an `extends` constraint
         * in a function type argument.
         *
         * @example
         * <caption>Using generic type argument syntax</caption>
         * ```ts
         * expectTypeOf({ a: 1, b: 1 }).toMatchTypeOf<{ a: number }>()
         * ```
         *
         * @example
         * <caption>Using inferred type syntax by passing a value</caption>
         * ```ts
         * expectTypeOf({ a: 1, b: 1 }).toMatchTypeOf({ a: 2 })
         * ```
         *
         * @param value - The value to compare against the expected type.
         * @param MISMATCH - The mismatch arguments.
         * @returns `true`.
         */
        <Expected>(value: Expected & AValue, // reason for `& AValue`: make sure this is only the selected overload when the end-user passes a value for an inferred typearg. The `Mismatch` type does match `AValue`.
        ...MISMATCH: MismatchArgs<Extends<Actual, Expected>, false>): true;
        /**
         * @deprecated Since v1.2.0 - Use either {@linkcode toMatchObjectType} or {@linkcode toExtend} instead
         *
         * - Use {@linkcode toMatchObjectType} to perform a strict check on a subset of your type's keys
         * - Use {@linkcode toExtend} to check if your type extends the expected type
         *
         * A less strict version of
         * {@linkcode PositiveExpectTypeOf.toEqualTypeOf | .toEqualTypeOf()}
         * that allows for extra properties.
         * This is roughly equivalent to an `extends` constraint
         * in a function type argument.
         *
         * @example
         * <caption>Using generic type argument syntax</caption>
         * ```ts
         * expectTypeOf({ a: 1, b: 1 }).toMatchTypeOf<{ a: number }>()
         * ```
         *
         * @example
         * <caption>Using inferred type syntax by passing a value</caption>
         * ```ts
         * expectTypeOf({ a: 1, b: 1 }).toMatchTypeOf({ a: 2 })
         * ```
         *
         * @param MISMATCH - The mismatch arguments.
         * @returns `true`.
         */
        <Expected>(...MISMATCH: MismatchArgs<Extends<Actual, Expected>, false>): true;
    };
    /**
     * Checks whether an object has a given property.
     *
     * @example
     * <caption>check that properties exist</caption>
     * ```ts
     * const obj = { a: 1, b: '' }
     *
     * expectTypeOf(obj).toHaveProperty('a')
     *
     * expectTypeOf(obj).not.toHaveProperty('c')
     * ```
     *
     * @param key - The property key to check for.
     * @param MISMATCH - The mismatch arguments.
     * @returns `true`.
     */
    toHaveProperty: <KeyType extends string | number | symbol>(key: KeyType, ...MISMATCH: MismatchArgs<Extends<KeyType, keyof Actual>, false>) => true;
}
/**
 * Represents a conditional type that selects either
 * {@linkcode PositiveExpectTypeOf} or {@linkcode NegativeExpectTypeOf} based
 * on the value of the `positive` property in the {@linkcode Options} type.
 */
type ExpectTypeOf<Actual, Options extends {
    positive: boolean;
}> = Options['positive'] extends true ? PositiveExpectTypeOf<Actual> : NegativeExpectTypeOf<Actual>;
/**
 * Represents the base interface for the
 * {@linkcode expectTypeOf()} function.
 * Provides a set of assertion methods to perform type checks on a value.
 */
interface BaseExpectTypeOf<Actual, Options extends {
    positive: boolean;
}> {
    /**
     * Checks whether the type of the value is `any`.
     */
    toBeAny: Scolder<ExpectAny<Actual>, Options>;
    /**
     * Checks whether the type of the value is `unknown`.
     */
    toBeUnknown: Scolder<ExpectUnknown<Actual>, Options>;
    /**
     * Checks whether the type of the value is `never`.
     */
    toBeNever: Scolder<ExpectNever<Actual>, Options>;
    /**
     * Checks whether the type of the value is `function`.
     */
    toBeFunction: Scolder<ExpectFunction<Actual>, Options>;
    /**
     * Checks whether the type of the value is `object`.
     */
    toBeObject: Scolder<ExpectObject<Actual>, Options>;
    /**
     * Checks whether the type of the value is an {@linkcode Array}.
     */
    toBeArray: Scolder<ExpectArray<Actual>, Options>;
    /**
     * Checks whether the type of the value is `number`.
     */
    toBeNumber: Scolder<ExpectNumber<Actual>, Options>;
    /**
     * Checks whether the type of the value is `string`.
     */
    toBeString: Scolder<ExpectString<Actual>, Options>;
    /**
     * Checks whether the type of the value is `boolean`.
     */
    toBeBoolean: Scolder<ExpectBoolean<Actual>, Options>;
    /**
     * Checks whether the type of the value is `void`.
     */
    toBeVoid: Scolder<ExpectVoid<Actual>, Options>;
    /**
     * Checks whether the type of the value is `symbol`.
     */
    toBeSymbol: Scolder<ExpectSymbol<Actual>, Options>;
    /**
     * Checks whether the type of the value is `null`.
     */
    toBeNull: Scolder<ExpectNull<Actual>, Options>;
    /**
     * Checks whether the type of the value is `undefined`.
     */
    toBeUndefined: Scolder<ExpectUndefined<Actual>, Options>;
    /**
     * Checks whether the type of the value is `null` or `undefined`.
     */
    toBeNullable: Scolder<ExpectNullable<Actual>, Options>;
    /**
     * Transform that type of the value via a callback.
     *
     * @param fn - A callback that transforms the input value. Note that this function is not actually called - it's only used for type inference.
     * @returns A new type which can be used for further assertions.
     */
    map: <T>(fn: (value: Actual) => T) => ExpectTypeOf<T, Options>;
    /**
     * Checks whether the type of the value is **`bigint`**.
     *
     * @example
     * <caption>#### Distinguish between **`number`** and **`bigint`**</caption>
     *
     * ```ts
     * import { expectTypeOf } from 'expect-type'
     *
     * const aVeryBigInteger = 10n ** 100n
     *
     * expectTypeOf(aVeryBigInteger).not.toBeNumber()
     *
     * expectTypeOf(aVeryBigInteger).toBeBigInt()
     * ```
     *
     * @since 1.1.0
     */
    toBeBigInt: Scolder<ExpectBigInt<Actual>, Options>;
    /**
     * Checks whether a function is callable with the given parameters.
     *
     * __Note__: You cannot negate this assertion with
     * {@linkcode PositiveExpectTypeOf.not | .not}, you need to use
     * `ts-expect-error` instead.
     *
     * @example
     * ```ts
     * const f = (a: number) => [a, a]
     *
     * expectTypeOf(f).toBeCallableWith(1)
     * ```
     *
     * __Known Limitation__: This assertion will likely fail if you try to use it
     * with a generic function or an overload.
     * @see {@link https://github.com/mmkal/expect-type/issues/50 | This issue} for an example and a workaround.
     *
     * @param args - The arguments to check for callability.
     * @returns `true`.
     */
    toBeCallableWith: Options['positive'] extends true ? <Args extends OverloadParameters<Actual>>(...args: Args) => ExpectTypeOf<OverloadsNarrowedByParameters<Actual, Args>, Options> : never;
    /**
     * Checks whether a class is constructible with the given parameters.
     *
     * @example
     * ```ts
     * expectTypeOf(Date).toBeConstructibleWith('1970')
     *
     * expectTypeOf(Date).toBeConstructibleWith(0)
     *
     * expectTypeOf(Date).toBeConstructibleWith(new Date())
     *
     * expectTypeOf(Date).toBeConstructibleWith()
     * ```
     *
     * @param args - The arguments to check for constructibility.
     * @returns `true`.
     */
    toBeConstructibleWith: Options['positive'] extends true ? <Args extends ConstructorOverloadParameters<Actual>>(...args: Args) => true : never;
    /**
     * Equivalent to the {@linkcode Extract} utility type.
     * Helps narrow down complex union types.
     *
     * @example
     * ```ts
     * type ResponsiveProp<T> = T | T[] | { xs?: T; sm?: T; md?: T }
     *
     * interface CSSProperties {
     *   margin?: string
     *   padding?: string
     * }
     *
     * function getResponsiveProp<T>(_props: T): ResponsiveProp<T> {
     *   return {}
     * }
     *
     * const cssProperties: CSSProperties = { margin: '1px', padding: '2px' }
     *
     * expectTypeOf(getResponsiveProp(cssProperties))
     *   .extract<{ xs?: any }>() // extracts the last type from a union
     *   .toEqualTypeOf<{
     *     xs?: CSSProperties
     *     sm?: CSSProperties
     *     md?: CSSProperties
     *   }>()
     *
     * expectTypeOf(getResponsiveProp(cssProperties))
     *   .extract<unknown[]>() // extracts an array from a union
     *   .toEqualTypeOf<CSSProperties[]>()
     * ```
     *
     * __Note__: If no type is found in the union, it will return `never`.
     *
     * @param v - The type to extract from the union.
     * @returns The type after extracting the type from the union.
     */
    extract: <V>(v?: V) => ExpectTypeOf<Extract<Actual, V>, Options>;
    /**
     * Equivalent to the {@linkcode Exclude} utility type.
     * Removes types from a union.
     *
     * @example
     * ```ts
     * type ResponsiveProp<T> = T | T[] | { xs?: T; sm?: T; md?: T }
     *
     * interface CSSProperties {
     *   margin?: string
     *   padding?: string
     * }
     *
     * function getResponsiveProp<T>(_props: T): ResponsiveProp<T> {
     *   return {}
     * }
     *
     * const cssProperties: CSSProperties = { margin: '1px', padding: '2px' }
     *
     * expectTypeOf(getResponsiveProp(cssProperties))
     *   .exclude<unknown[]>()
     *   .exclude<{ xs?: unknown }>() // or just `.exclude<unknown[] | { xs?: unknown }>()`
     *   .toEqualTypeOf<CSSProperties>()
     * ```
     */
    exclude: <V>(v?: V) => ExpectTypeOf<Exclude<Actual, V>, Options>;
    /**
     * Equivalent to the {@linkcode Pick} utility type.
     * Helps select a subset of properties from an object type.
     *
     * @example
     * ```ts
     * interface Person {
     *   name: string
     *   age: number
     * }
     *
     * expectTypeOf<Person>()
     *   .pick<'name'>()
     *   .toEqualTypeOf<{ name: string }>()
     * ```
     *
     * @param keyToPick - The property key to pick.
     * @returns The type after picking the property.
     */
    pick: <KeyToPick extends keyof Actual>(keyToPick?: KeyToPick) => ExpectTypeOf<Pick<Actual, KeyToPick>, Options>;
    /**
     * Equivalent to the {@linkcode Omit} utility type.
     * Helps remove a subset of properties from an object type.
     *
     * @example
     * ```ts
     * interface Person {
     *   name: string
     *   age: number
     * }
     *
     * expectTypeOf<Person>().omit<'name'>().toEqualTypeOf<{ age: number }>()
     * ```
     *
     * @param keyToOmit - The property key to omit.
     * @returns The type after omitting the property.
     */
    omit: <KeyToOmit extends keyof Actual | (PropertyKey & Record<never, never>)>(keyToOmit?: KeyToOmit) => ExpectTypeOf<Omit<Actual, KeyToOmit>, Options>;
    /**
     * Extracts a certain function argument with `.parameter(number)` call to
     * perform other assertions on it.
     *
     * @example
     * ```ts
     * function foo(a: number, b: string) {
     *   return [a, b]
     * }
     *
     * expectTypeOf(foo).parameter(0).toBeNumber()
     *
     * expectTypeOf(foo).parameter(1).toBeString()
     * ```
     *
     * @param index - The index of the parameter to extract.
     * @returns The extracted parameter type.
     */
    parameter: <Index extends number>(index: Index) => ExpectTypeOf<OverloadParameters<Actual>[Index], Options>;
    /**
     * Equivalent to the {@linkcode Parameters} utility type.
     * Extracts function parameters to perform assertions on its value.
     * Parameters are returned as an array.
     *
     * @example
     * ```ts
     * function noParam() {}
     *
     * function hasParam(s: string) {}
     *
     * expectTypeOf(noParam).parameters.toEqualTypeOf<[]>()
     *
     * expectTypeOf(hasParam).parameters.toEqualTypeOf<[string]>()
     * ```
     */
    parameters: ExpectTypeOf<OverloadParameters<Actual>, Options>;
    /**
     * Equivalent to the {@linkcode ConstructorParameters} utility type.
     * Extracts constructor parameters as an array of values and
     * perform assertions on them with this method.
     *
     * For overloaded constructors it will return a union of all possible parameter-tuples.
     *
     * @example
     * ```ts
     * expectTypeOf(Date).constructorParameters.toEqualTypeOf<
     *   [] | [string | number | Date]
     * >()
     * ```
     */
    constructorParameters: ExpectTypeOf<ConstructorOverloadParameters<Actual>, Options>;
    /**
     * Equivalent to the {@linkcode ThisParameterType} utility type.
     * Extracts the `this` parameter of a function to
     * perform assertions on its value.
     *
     * @example
     * ```ts
     * function greet(this: { name: string }, message: string) {
     *   return `Hello ${this.name}, here's your message: ${message}`
     * }
     *
     * expectTypeOf(greet).thisParameter.toEqualTypeOf<{ name: string }>()
     * ```
     */
    thisParameter: ExpectTypeOf<OverloadThisParameterTypes<Actual>, Options>;
    /**
     * Equivalent to the {@linkcode InstanceType} utility type.
     * Extracts the instance type of a class to perform assertions on.
     *
     * @example
     * ```ts
     * expectTypeOf(Date).instance.toHaveProperty('toISOString')
     * ```
     */
    instance: Actual extends new (...args: any[]) => infer I ? ExpectTypeOf<I, Options> : never;
    /**
     * Equivalent to the {@linkcode ReturnType} utility type.
     * Extracts the return type of a function.
     *
     * @example
     * ```ts
     * expectTypeOf(() => {}).returns.toBeVoid()
     *
     * expectTypeOf((a: number) => [a, a]).returns.toEqualTypeOf([1, 2])
     * ```
     */
    returns: Actual extends Function ? ExpectTypeOf<OverloadReturnTypes<Actual>, Options> : never;
    /**
     * Extracts resolved value of a Promise,
     * so you can perform other assertions on it.
     *
     * @example
     * ```ts
     * async function asyncFunc() {
     *   return 123
     * }
     *
     * expectTypeOf(asyncFunc).returns.resolves.toBeNumber()
     *
     * expectTypeOf(Promise.resolve('string')).resolves.toBeString()
     * ```
     *
     * Type Equivalent:
     * ```ts
     * type Resolves<PromiseType> = PromiseType extends PromiseLike<infer ResolvedType>
     *   ? ResolvedType
     *   : never
     * ```
     */
    resolves: Actual extends PromiseLike<infer ResolvedType> ? ExpectTypeOf<ResolvedType, Options> : never;
    /**
     * Extracts array item type to perform assertions on.
     *
     * @example
     * ```ts
     * expectTypeOf([1, 2, 3]).items.toEqualTypeOf<number>()
     *
     * expectTypeOf([1, 2, 3]).items.not.toEqualTypeOf<string>()
     * ```
     *
     * __Type Equivalent__:
     * ```ts
     * type Items<ArrayType> = ArrayType extends ArrayLike<infer ItemType>
     *   ? ItemType
     *   : never
     * ```
     */
    items: Actual extends ArrayLike<infer ItemType> ? ExpectTypeOf<ItemType, Options> : never;
    /**
     * Extracts the type guarded by a function to perform assertions on.
     *
     * @example
     * ```ts
     * function isString(v: any): v is string {
     *   return typeof v === 'string'
     * }
     *
     * expectTypeOf(isString).guards.toBeString()
     * ```
     */
    guards: Actual extends (v: any, ...args: any[]) => v is infer T ? ExpectTypeOf<T, Options> : never;
    /**
     * Extracts the type asserted by a function to perform assertions on.
     *
     * @example
     * ```ts
     * function assertNumber(v: any): asserts v is number {
     *   if (typeof v !== 'number')
     *     throw new TypeError('Nope !')
     * }
     *
     * expectTypeOf(assertNumber).asserts.toBeNumber()
     * ```
     */
    asserts: Actual extends (v: any, ...args: any[]) => asserts v is infer T ? unknown extends T ? never : ExpectTypeOf<T, Options> : never;
}
/**
 * Represents a function that allows asserting the expected type of a value.
 */
type _ExpectTypeOf = {
    /**
     * Asserts the expected type of a value.
     *
     * @param actual - The actual value being asserted.
     * @returns An object representing the expected type assertion.
     */
    <Actual>(actual: Actual): ExpectTypeOf<Actual, {
        positive: true;
        branded: false;
    }>;
    /**
     * Asserts the expected type of a value without providing an actual value.
     *
     * @returns An object representing the expected type assertion.
     */
    <Actual>(): ExpectTypeOf<Actual, {
        positive: true;
        branded: false;
    }>;
};
/**
 * Similar to Jest's `expect`, but with type-awareness.
 * Gives you access to a number of type-matchers that let you make assertions about the
 * form of a reference or generic type parameter.
 *
 * @example
 * ```ts
 * import { foo, bar } from '../foo'
 * import { expectTypeOf } from 'expect-type'
 *
 * test('foo types', () => {
 *   // make sure `foo` has type { a: number }
 *   expectTypeOf(foo).toMatchTypeOf({ a: 1 })
 *   expectTypeOf(foo).toHaveProperty('a').toBeNumber()
 *
 *   // make sure `bar` is a function taking a string:
 *   expectTypeOf(bar).parameter(0).toBeString()
 *   expectTypeOf(bar).returns.not.toBeAny()
 * })
 * ```
 *
 * @description
 * See the [full docs](https://npmjs.com/package/expect-type#documentation) for lots more examples.
 */
declare const expectTypeOf: _ExpectTypeOf;

// Type definitions for aria-query 5.0
// Project: https://github.com/A11yance/aria-query#readme
// Definitions by: Sebastian Silbermann <https://github.com/eps1lon>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 3.0



type ARIAWidgetRole =
    | 'button'
    | 'checkbox'
    | 'gridcell'
    | 'link'
    | 'menuitem'
    | 'menuitemcheckbox'
    | 'menuitemradio'
    | 'option'
    | 'progressbar'
    | 'radio'
    | 'scrollbar'
    | 'searchbox'
    | 'slider'
    | 'spinbutton'
    | 'switch'
    | 'tab'
    | 'tabpanel'
    | 'textbox'
    | 'treeitem';

type ARIACompositeWidgetRole =
    | 'combobox'
    | 'grid'
    | 'listbox'
    | 'menu'
    | 'menubar'
    | 'radiogroup'
    | 'tablist'
    | 'tree'
    | 'treegrid';

type ARIADocumentStructureRole =
    | 'application'
    | 'article'
    | 'blockquote'
    | 'caption'
    | 'cell'
    | 'columnheader'
    | 'definition'
    | 'deletion'
    | 'directory'
    | 'document'
    | 'emphasis'
    | 'feed'
    | 'figure'
    | 'generic'
    | 'group'
    | 'heading'
    | 'img'
    | 'insertion'
    | 'list'
    | 'listitem'
    | 'math'
    | 'meter'
    | 'none'
    | 'note'
    | 'paragraph'
    | 'presentation'
    | 'row'
    | 'rowgroup'
    | 'rowheader'
    | 'separator'
    | 'strong'
    | 'subscript'
    | 'superscript'
    | 'table'
    | 'term'
    | 'time'
    | 'toolbar'
    | 'tooltip';

type ARIALandmarkRole =
    | 'banner'
    | 'complementary'
    | 'contentinfo'
    | 'form'
    | 'main'
    | 'navigation'
    | 'region'
    | 'search';

type ARIALiveRegionRole = 'alert' | 'log' | 'marquee' | 'status' | 'timer';

type ARIAWindowRole = 'alertdialog' | 'dialog';

type ARIAUncategorizedRole = 'code';

type ARIARole =
    | ARIAWidgetRole
    | ARIACompositeWidgetRole
    | ARIADocumentStructureRole
    | ARIALandmarkRole
    | ARIALiveRegionRole
    | ARIAWindowRole
    | ARIAUncategorizedRole;

type MatcherFunction = (
  content: string,
  element: Element | null,
) => boolean
type Matcher = MatcherFunction | RegExp | number | string

// Get autocomplete for ARIARole union types, while still supporting another string
// Ref: https://github.com/microsoft/TypeScript/issues/29729#issuecomment-567871939
type ByRoleMatcher = ARIARole | (string & {})

type NormalizerFn = (text: string) => string

interface MatcherOptions {
  exact?: boolean
  /** Use normalizer with getDefaultNormalizer instead */
  trim?: boolean
  /** Use normalizer with getDefaultNormalizer instead */
  collapseWhitespace?: boolean
  normalizer?: NormalizerFn
  /** suppress suggestions for a specific query */
  suggest?: boolean
}

interface waitForOptions {
  container?: HTMLElement
  timeout?: number
  interval?: number
  onTimeout?: (error: Error) => Error
  mutationObserverOptions?: MutationObserverInit
}

interface SelectorMatcherOptions extends MatcherOptions {
  selector?: string
  ignore?: boolean | string
}

type QueryByBoundAttribute<T extends HTMLElement = HTMLElement> = (
  container: HTMLElement,
  id: Matcher,
  options?: MatcherOptions,
) => T | null

type AllByBoundAttribute<T extends HTMLElement = HTMLElement> = (
  container: HTMLElement,
  id: Matcher,
  options?: MatcherOptions,
) => T[]

type FindAllByBoundAttribute<T extends HTMLElement = HTMLElement> = (
  container: HTMLElement,
  id: Matcher,
  options?: MatcherOptions,
  waitForElementOptions?: waitForOptions,
) => Promise<T[]>

type GetByBoundAttribute<T extends HTMLElement = HTMLElement> = (
  container: HTMLElement,
  id: Matcher,
  options?: MatcherOptions,
) => T

type FindByBoundAttribute<T extends HTMLElement = HTMLElement> = (
  container: HTMLElement,
  id: Matcher,
  options?: MatcherOptions,
  waitForElementOptions?: waitForOptions,
) => Promise<T>

type QueryByText<T extends HTMLElement = HTMLElement> = (
  container: HTMLElement,
  id: Matcher,
  options?: SelectorMatcherOptions,
) => T | null

type AllByText<T extends HTMLElement = HTMLElement> = (
  container: HTMLElement,
  id: Matcher,
  options?: SelectorMatcherOptions,
) => T[]

type FindAllByText<T extends HTMLElement = HTMLElement> = (
  container: HTMLElement,
  id: Matcher,
  options?: SelectorMatcherOptions,
  waitForElementOptions?: waitForOptions,
) => Promise<T[]>

type GetByText<T extends HTMLElement = HTMLElement> = (
  container: HTMLElement,
  id: Matcher,
  options?: SelectorMatcherOptions,
) => T

type FindByText<T extends HTMLElement = HTMLElement> = (
  container: HTMLElement,
  id: Matcher,
  options?: SelectorMatcherOptions,
  waitForElementOptions?: waitForOptions,
) => Promise<T>

interface ByRoleOptions {
  /** suppress suggestions for a specific query */
  suggest?: boolean
  /**
   * If true includes elements in the query set that are usually excluded from
   * the accessibility tree. `role="none"` or `role="presentation"` are included
   * in either case.
   */
  hidden?: boolean
  /**
   * If true only includes elements in the query set that are marked as
   * selected in the accessibility tree, i.e., `aria-selected="true"`
   */
  selected?: boolean
  /**
   * If true only includes elements in the query set that are marked as
   * busy in the accessibility tree, i.e., `aria-busy="true"`
   */
  busy?: boolean
  /**
   * If true only includes elements in the query set that are marked as
   * checked in the accessibility tree, i.e., `aria-checked="true"`
   */
  checked?: boolean
  /**
   * If true only includes elements in the query set that are marked as
   * pressed in the accessibility tree, i.e., `aria-pressed="true"`
   */
  pressed?: boolean
  /**
   * Filters elements by their `aria-current` state. `true` and `false` match `aria-current="true"` and `aria-current="false"` (as well as a missing `aria-current` attribute) respectively.
   */
  current?: boolean | string
  /**
   * If true only includes elements in the query set that are marked as
   * expanded in the accessibility tree, i.e., `aria-expanded="true"`
   */
  expanded?: boolean
  /**
   * Includes elements with the `"heading"` role matching the indicated level,
   * either by the semantic HTML heading elements `<h1>-<h6>` or matching
   * the `aria-level` attribute.
   */
  level?: number
  value?: {
    now?: number
    min?: number
    max?: number
    text?: Matcher
  }
  /**
   * Includes every role used in the `role` attribute
   * For example *ByRole('progressbar', {queryFallbacks: true})` will find <div role="meter progressbar">`.
   */
  queryFallbacks?: boolean
  /**
   * Only considers elements with the specified accessible name.
   */
  name?:
    | RegExp
    | string
    | ((accessibleName: string, element: Element) => boolean)
  /**
   * Only considers elements with the specified accessible description.
   */
  description?:
    | RegExp
    | string
    | ((accessibleDescription: string, element: Element) => boolean)
}

type AllByRole<T extends HTMLElement = HTMLElement> = (
  container: HTMLElement,
  role: ByRoleMatcher,
  options?: ByRoleOptions,
) => T[]

type GetByRole<T extends HTMLElement = HTMLElement> = (
  container: HTMLElement,
  role: ByRoleMatcher,
  options?: ByRoleOptions,
) => T

type QueryByRole<T extends HTMLElement = HTMLElement> = (
  container: HTMLElement,
  role: ByRoleMatcher,
  options?: ByRoleOptions,
) => T | null

type FindByRole<T extends HTMLElement = HTMLElement> = (
  container: HTMLElement,
  role: ByRoleMatcher,
  options?: ByRoleOptions,
  waitForElementOptions?: waitForOptions,
) => Promise<T>

type FindAllByRole<T extends HTMLElement = HTMLElement> = (
  container: HTMLElement,
  role: ByRoleMatcher,
  options?: ByRoleOptions,
  waitForElementOptions?: waitForOptions,
) => Promise<T[]>

declare function getByLabelText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<GetByText<T>>
): ReturnType<GetByText<T>>
declare function getAllByLabelText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<AllByText<T>>
): ReturnType<AllByText<T>>
declare function queryByLabelText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<QueryByText<T>>
): ReturnType<QueryByText<T>>
declare function queryAllByLabelText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<AllByText<T>>
): ReturnType<AllByText<T>>
declare function findByLabelText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<FindByText<T>>
): ReturnType<FindByText<T>>
declare function findAllByLabelText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<FindAllByText<T>>
): ReturnType<FindAllByText<T>>
declare function getByPlaceholderText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<GetByBoundAttribute<T>>
): ReturnType<GetByBoundAttribute<T>>
declare function getAllByPlaceholderText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<AllByBoundAttribute<T>>
): ReturnType<AllByBoundAttribute<T>>
declare function queryByPlaceholderText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<QueryByBoundAttribute<T>>
): ReturnType<QueryByBoundAttribute<T>>
declare function queryAllByPlaceholderText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<AllByBoundAttribute<T>>
): ReturnType<AllByBoundAttribute<T>>
declare function findByPlaceholderText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<FindByBoundAttribute<T>>
): ReturnType<FindByBoundAttribute<T>>
declare function findAllByPlaceholderText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<FindAllByBoundAttribute<T>>
): ReturnType<FindAllByBoundAttribute<T>>
declare function getByText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<GetByText<T>>
): ReturnType<GetByText<T>>
declare function getAllByText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<AllByText<T>>
): ReturnType<AllByText<T>>
declare function queryByText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<QueryByText<T>>
): ReturnType<QueryByText<T>>
declare function queryAllByText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<AllByText<T>>
): ReturnType<AllByText<T>>
declare function findByText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<FindByText<T>>
): ReturnType<FindByText<T>>
declare function findAllByText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<FindAllByText<T>>
): ReturnType<FindAllByText<T>>
declare function getByAltText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<GetByBoundAttribute<T>>
): ReturnType<GetByBoundAttribute<T>>
declare function getAllByAltText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<AllByBoundAttribute<T>>
): ReturnType<AllByBoundAttribute<T>>
declare function queryByAltText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<QueryByBoundAttribute<T>>
): ReturnType<QueryByBoundAttribute<T>>
declare function queryAllByAltText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<AllByBoundAttribute<T>>
): ReturnType<AllByBoundAttribute<T>>
declare function findByAltText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<FindByBoundAttribute<T>>
): ReturnType<FindByBoundAttribute<T>>
declare function findAllByAltText<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<FindAllByBoundAttribute<T>>
): ReturnType<FindAllByBoundAttribute<T>>
declare function getByTitle<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<GetByBoundAttribute<T>>
): ReturnType<GetByBoundAttribute<T>>
declare function getAllByTitle<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<AllByBoundAttribute<T>>
): ReturnType<AllByBoundAttribute<T>>
declare function queryByTitle<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<QueryByBoundAttribute<T>>
): ReturnType<QueryByBoundAttribute<T>>
declare function queryAllByTitle<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<AllByBoundAttribute<T>>
): ReturnType<AllByBoundAttribute<T>>
declare function findByTitle<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<FindByBoundAttribute<T>>
): ReturnType<FindByBoundAttribute<T>>
declare function findAllByTitle<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<FindAllByBoundAttribute<T>>
): ReturnType<FindAllByBoundAttribute<T>>
declare function getByDisplayValue<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<GetByBoundAttribute<T>>
): ReturnType<GetByBoundAttribute<T>>
declare function getAllByDisplayValue<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<AllByBoundAttribute<T>>
): ReturnType<AllByBoundAttribute<T>>
declare function queryByDisplayValue<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<QueryByBoundAttribute<T>>
): ReturnType<QueryByBoundAttribute<T>>
declare function queryAllByDisplayValue<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<AllByBoundAttribute<T>>
): ReturnType<AllByBoundAttribute<T>>
declare function findByDisplayValue<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<FindByBoundAttribute<T>>
): ReturnType<FindByBoundAttribute<T>>
declare function findAllByDisplayValue<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<FindAllByBoundAttribute<T>>
): ReturnType<FindAllByBoundAttribute<T>>
declare function getByRole<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<GetByRole<T>>
): ReturnType<GetByRole<T>>
declare function getAllByRole<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<AllByRole<T>>
): ReturnType<AllByRole<T>>
declare function queryByRole<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<QueryByRole<T>>
): ReturnType<QueryByRole<T>>
declare function queryAllByRole<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<AllByRole<T>>
): ReturnType<AllByRole<T>>
declare function findByRole<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<FindByRole<T>>
): ReturnType<FindByRole<T>>
declare function findAllByRole<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<FindAllByRole<T>>
): ReturnType<FindAllByRole<T>>
declare function getByTestId<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<GetByBoundAttribute<T>>
): ReturnType<GetByBoundAttribute<T>>
declare function getAllByTestId<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<AllByBoundAttribute<T>>
): ReturnType<AllByBoundAttribute<T>>
declare function queryByTestId<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<QueryByBoundAttribute<T>>
): ReturnType<QueryByBoundAttribute<T>>
declare function queryAllByTestId<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<AllByBoundAttribute<T>>
): ReturnType<AllByBoundAttribute<T>>
declare function findByTestId<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<FindByBoundAttribute<T>>
): ReturnType<FindByBoundAttribute<T>>
declare function findAllByTestId<T extends HTMLElement = HTMLElement>(
  ...args: Parameters<FindAllByBoundAttribute<T>>
): ReturnType<FindAllByBoundAttribute<T>>

type queries_AllByBoundAttribute<T extends HTMLElement = HTMLElement> = AllByBoundAttribute<T>;
type queries_AllByRole<T extends HTMLElement = HTMLElement> = AllByRole<T>;
type queries_AllByText<T extends HTMLElement = HTMLElement> = AllByText<T>;
type queries_ByRoleOptions = ByRoleOptions;
type queries_FindAllByBoundAttribute<T extends HTMLElement = HTMLElement> = FindAllByBoundAttribute<T>;
type queries_FindAllByRole<T extends HTMLElement = HTMLElement> = FindAllByRole<T>;
type queries_FindAllByText<T extends HTMLElement = HTMLElement> = FindAllByText<T>;
type queries_FindByBoundAttribute<T extends HTMLElement = HTMLElement> = FindByBoundAttribute<T>;
type queries_FindByRole<T extends HTMLElement = HTMLElement> = FindByRole<T>;
type queries_FindByText<T extends HTMLElement = HTMLElement> = FindByText<T>;
type queries_GetByBoundAttribute<T extends HTMLElement = HTMLElement> = GetByBoundAttribute<T>;
type queries_GetByRole<T extends HTMLElement = HTMLElement> = GetByRole<T>;
type queries_GetByText<T extends HTMLElement = HTMLElement> = GetByText<T>;
type queries_QueryByBoundAttribute<T extends HTMLElement = HTMLElement> = QueryByBoundAttribute<T>;
type queries_QueryByRole<T extends HTMLElement = HTMLElement> = QueryByRole<T>;
type queries_QueryByText<T extends HTMLElement = HTMLElement> = QueryByText<T>;
declare const queries_findAllByAltText: typeof findAllByAltText;
declare const queries_findAllByDisplayValue: typeof findAllByDisplayValue;
declare const queries_findAllByLabelText: typeof findAllByLabelText;
declare const queries_findAllByPlaceholderText: typeof findAllByPlaceholderText;
declare const queries_findAllByRole: typeof findAllByRole;
declare const queries_findAllByTestId: typeof findAllByTestId;
declare const queries_findAllByText: typeof findAllByText;
declare const queries_findAllByTitle: typeof findAllByTitle;
declare const queries_findByAltText: typeof findByAltText;
declare const queries_findByDisplayValue: typeof findByDisplayValue;
declare const queries_findByLabelText: typeof findByLabelText;
declare const queries_findByPlaceholderText: typeof findByPlaceholderText;
declare const queries_findByRole: typeof findByRole;
declare const queries_findByTestId: typeof findByTestId;
declare const queries_findByText: typeof findByText;
declare const queries_findByTitle: typeof findByTitle;
declare const queries_getAllByAltText: typeof getAllByAltText;
declare const queries_getAllByDisplayValue: typeof getAllByDisplayValue;
declare const queries_getAllByLabelText: typeof getAllByLabelText;
declare const queries_getAllByPlaceholderText: typeof getAllByPlaceholderText;
declare const queries_getAllByRole: typeof getAllByRole;
declare const queries_getAllByTestId: typeof getAllByTestId;
declare const queries_getAllByText: typeof getAllByText;
declare const queries_getAllByTitle: typeof getAllByTitle;
declare const queries_getByAltText: typeof getByAltText;
declare const queries_getByDisplayValue: typeof getByDisplayValue;
declare const queries_getByLabelText: typeof getByLabelText;
declare const queries_getByPlaceholderText: typeof getByPlaceholderText;
declare const queries_getByRole: typeof getByRole;
declare const queries_getByTestId: typeof getByTestId;
declare const queries_getByText: typeof getByText;
declare const queries_getByTitle: typeof getByTitle;
declare const queries_queryAllByAltText: typeof queryAllByAltText;
declare const queries_queryAllByDisplayValue: typeof queryAllByDisplayValue;
declare const queries_queryAllByLabelText: typeof queryAllByLabelText;
declare const queries_queryAllByPlaceholderText: typeof queryAllByPlaceholderText;
declare const queries_queryAllByRole: typeof queryAllByRole;
declare const queries_queryAllByTestId: typeof queryAllByTestId;
declare const queries_queryAllByText: typeof queryAllByText;
declare const queries_queryAllByTitle: typeof queryAllByTitle;
declare const queries_queryByAltText: typeof queryByAltText;
declare const queries_queryByDisplayValue: typeof queryByDisplayValue;
declare const queries_queryByLabelText: typeof queryByLabelText;
declare const queries_queryByPlaceholderText: typeof queryByPlaceholderText;
declare const queries_queryByRole: typeof queryByRole;
declare const queries_queryByTestId: typeof queryByTestId;
declare const queries_queryByText: typeof queryByText;
declare const queries_queryByTitle: typeof queryByTitle;
declare namespace queries {
  export { queries_findAllByAltText as findAllByAltText, queries_findAllByDisplayValue as findAllByDisplayValue, queries_findAllByLabelText as findAllByLabelText, queries_findAllByPlaceholderText as findAllByPlaceholderText, queries_findAllByRole as findAllByRole, queries_findAllByTestId as findAllByTestId, queries_findAllByText as findAllByText, queries_findAllByTitle as findAllByTitle, queries_findByAltText as findByAltText, queries_findByDisplayValue as findByDisplayValue, queries_findByLabelText as findByLabelText, queries_findByPlaceholderText as findByPlaceholderText, queries_findByRole as findByRole, queries_findByTestId as findByTestId, queries_findByText as findByText, queries_findByTitle as findByTitle, queries_getAllByAltText as getAllByAltText, queries_getAllByDisplayValue as getAllByDisplayValue, queries_getAllByLabelText as getAllByLabelText, queries_getAllByPlaceholderText as getAllByPlaceholderText, queries_getAllByRole as getAllByRole, queries_getAllByTestId as getAllByTestId, queries_getAllByText as getAllByText, queries_getAllByTitle as getAllByTitle, queries_getByAltText as getByAltText, queries_getByDisplayValue as getByDisplayValue, queries_getByLabelText as getByLabelText, queries_getByPlaceholderText as getByPlaceholderText, queries_getByRole as getByRole, queries_getByTestId as getByTestId, queries_getByText as getByText, queries_getByTitle as getByTitle, queries_queryAllByAltText as queryAllByAltText, queries_queryAllByDisplayValue as queryAllByDisplayValue, queries_queryAllByLabelText as queryAllByLabelText, queries_queryAllByPlaceholderText as queryAllByPlaceholderText, queries_queryAllByRole as queryAllByRole, queries_queryAllByTestId as queryAllByTestId, queries_queryAllByText as queryAllByText, queries_queryAllByTitle as queryAllByTitle, queries_queryByAltText as queryByAltText, queries_queryByDisplayValue as queryByDisplayValue, queries_queryByLabelText as queryByLabelText, queries_queryByPlaceholderText as queryByPlaceholderText, queries_queryByRole as queryByRole, queries_queryByTestId as queryByTestId, queries_queryByText as queryByText, queries_queryByTitle as queryByTitle };
  export type { queries_AllByBoundAttribute as AllByBoundAttribute, queries_AllByRole as AllByRole, queries_AllByText as AllByText, queries_ByRoleOptions as ByRoleOptions, queries_FindAllByBoundAttribute as FindAllByBoundAttribute, queries_FindAllByRole as FindAllByRole, queries_FindAllByText as FindAllByText, queries_FindByBoundAttribute as FindByBoundAttribute, queries_FindByRole as FindByRole, queries_FindByText as FindByText, queries_GetByBoundAttribute as GetByBoundAttribute, queries_GetByRole as GetByRole, queries_GetByText as GetByText, queries_QueryByBoundAttribute as QueryByBoundAttribute, queries_QueryByRole as QueryByRole, queries_QueryByText as QueryByText };
}

/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
declare type Colors = {
    comment: {
        close: string;
        open: string;
    };
    content: {
        close: string;
        open: string;
    };
    prop: {
        close: string;
        open: string;
    };
    tag: {
        close: string;
        open: string;
    };
    value: {
        close: string;
        open: string;
    };
};
declare type Indent = (arg0: string) => string;
declare type Refs = Array<unknown>;
declare type Print = (arg0: unknown) => string;
declare type ThemeReceived = {
    comment?: string;
    content?: string;
    prop?: string;
    tag?: string;
    value?: string;
};
declare type CompareKeys = ((a: string, b: string) => number) | undefined;
interface PrettyFormatOptions {
    callToJSON?: boolean;
    compareKeys?: CompareKeys;
    escapeRegex?: boolean;
    escapeString?: boolean;
    highlight?: boolean;
    indent?: number;
    maxDepth?: number;
    min?: boolean;
    plugins?: Plugins;
    printBasicPrototype?: boolean;
    printFunctionName?: boolean;
    theme?: ThemeReceived;
}
declare type OptionsReceived = PrettyFormatOptions;
declare type Config = {
    callToJSON: boolean;
    compareKeys: CompareKeys;
    colors: Colors;
    escapeRegex: boolean;
    escapeString: boolean;
    indent: string;
    maxDepth: number;
    min: boolean;
    plugins: Plugins;
    printBasicPrototype: boolean;
    printFunctionName: boolean;
    spacingInner: string;
    spacingOuter: string;
};
declare type Printer = (val: unknown, config: Config, indentation: string, depth: number, refs: Refs, hasCalledToJSON?: boolean) => string;
declare type Test = (arg0: any) => boolean;
declare type NewPlugin = {
    serialize: (val: any, config: Config, indentation: string, depth: number, refs: Refs, printer: Printer) => string;
    test: Test;
};
declare type PluginOptions = {
    edgeSpacing: string;
    min: boolean;
    spacing: string;
};
declare type OldPlugin = {
    print: (val: unknown, print: Print, indent: Indent, options: PluginOptions, colors: Colors) => string;
    test: Test;
};
declare type Plugin = NewPlugin | OldPlugin;
declare type Plugins = Array<Plugin>;

interface PrettyDOMOptions extends OptionsReceived {
  /**
   * Given a `Node` return `false` if you wish to ignore that node in the output.
   * By default, ignores `<style />`, `<script />` and comment nodes.
   */
  filterNode?: (node: Node) => boolean
}

declare function prettyDOM(
  dom?: Element | HTMLDocument,
  maxLength?: number,
  options?: PrettyDOMOptions,
): string | false

declare namespace matchers {
  interface TestingLibraryMatchers<E, R> {
    /**
     * @deprecated
     * since v1.9.0
     * @description
     * Assert whether a value is a DOM element, or not. Contrary to what its name implies, this matcher only checks
     * that you passed to it a valid DOM element.
     *
     * It does not have a clear definition of what "the DOM" is. Therefore, it does not check whether that element
     * is contained anywhere.
     * @see
     * [testing-library/jest-dom#toBeInTheDom](https://github.com/testing-library/jest-dom#toBeInTheDom)
     */
    toBeInTheDOM(container?: HTMLElement | SVGElement): R
    /**
     * @description
     * Assert whether an element is present in the document or not.
     * @example
     * <svg data-testid="svg-element"></svg>
     *
     * expect(queryByTestId('svg-element')).toBeInTheDocument()
     * expect(queryByTestId('does-not-exist')).not.toBeInTheDocument()
     * @see
     * [testing-library/jest-dom#tobeinthedocument](https://github.com/testing-library/jest-dom#tobeinthedocument)
     */
    toBeInTheDocument(): R
    /**
     * @description
     * This allows you to check if an element is currently visible to the user.
     *
     * An element is visible if **all** the following conditions are met:
     * * it does not have its css property display set to none
     * * it does not have its css property visibility set to either hidden or collapse
     * * it does not have its css property opacity set to 0
     * * its parent element is also visible (and so on up to the top of the DOM tree)
     * * it does not have the hidden attribute
     * * if `<details />` it has the open attribute
     * @example
     * <div
     *   data-testid="zero-opacity"
     *   style="opacity: 0"
     * >
     *   Zero Opacity
     * </div>
     *
     * <div data-testid="visible">Visible Example</div>
     *
     * expect(getByTestId('zero-opacity')).not.toBeVisible()
     * expect(getByTestId('visible')).toBeVisible()
     * @see
     * [testing-library/jest-dom#tobevisible](https://github.com/testing-library/jest-dom#tobevisible)
     */
    toBeVisible(): R
    /**
     * @deprecated
     * since v5.9.0
     * @description
     * Assert whether an element has content or not.
     * @example
     * <span data-testid="not-empty">
     *   <span data-testid="empty"></span>
     * </span>
     *
     * expect(getByTestId('empty')).toBeEmpty()
     * expect(getByTestId('not-empty')).not.toBeEmpty()
     * @see
     * [testing-library/jest-dom#tobeempty](https://github.com/testing-library/jest-dom#tobeempty)
     */
    toBeEmpty(): R
    /**
     * @description
     * Assert whether an element has content or not.
     * @example
     * <span data-testid="not-empty">
     *   <span data-testid="empty"></span>
     * </span>
     *
     * expect(getByTestId('empty')).toBeEmptyDOMElement()
     * expect(getByTestId('not-empty')).not.toBeEmptyDOMElement()
     * @see
     * [testing-library/jest-dom#tobeemptydomelement](https://github.com/testing-library/jest-dom#tobeemptydomelement)
     */
    toBeEmptyDOMElement(): R
    /**
     * @description
     * Allows you to check whether an element is disabled from the user's perspective.
     *
     * Matches if the element is a form control and the `disabled` attribute is specified on this element or the
     * element is a descendant of a form element with a `disabled` attribute.
     * @example
     * <button
     *   data-testid="button"
     *   type="submit"
     *   disabled
     * >
     *   submit
     * </button>
     *
     * expect(getByTestId('button')).toBeDisabled()
     * @see
     * [testing-library/jest-dom#tobedisabled](https://github.com/testing-library/jest-dom#tobedisabled)
     */
    toBeDisabled(): R
    /**
     * @description
     * Allows you to check whether an element is not disabled from the user's perspective.
     *
     * Works like `not.toBeDisabled()`.
     *
     * Use this matcher to avoid double negation in your tests.
     * @example
     * <button
     *   data-testid="button"
     *   type="submit"
     * >
     *   submit
     * </button>
     *
     * expect(getByTestId('button')).toBeEnabled()
     * @see
     * [testing-library/jest-dom#tobeenabled](https://github.com/testing-library/jest-dom#tobeenabled)
     */
    toBeEnabled(): R
    /**
     * @description
     * Check if a form element, or the entire `form`, is currently invalid.
     *
     * An `input`, `select`, `textarea`, or `form` element is invalid if it has an `aria-invalid` attribute with no
     * value or a value of "true", or if the result of `checkValidity()` is false.
     * @example
     * <input data-testid="no-aria-invalid" />
     *
     * <form data-testid="invalid-form">
     *   <input required />
     * </form>
     *
     * expect(getByTestId('no-aria-invalid')).not.toBeInvalid()
     * expect(getByTestId('invalid-form')).toBeInvalid()
     * @see
     * [testing-library/jest-dom#tobeinvalid](https://github.com/testing-library/jest-dom#tobeinvalid)
     */
    toBeInvalid(): R
    /**
     * @description
     * This allows you to check if a form element is currently required.
     *
     * An element is required if it is having a `required` or `aria-required="true"` attribute.
     * @example
     * <input data-testid="required-input" required />
     * <div
     *   data-testid="supported-role"
     *   role="tree"
     *   required />
     *
     * expect(getByTestId('required-input')).toBeRequired()
     * expect(getByTestId('supported-role')).not.toBeRequired()
     * @see
     * [testing-library/jest-dom#toberequired](https://github.com/testing-library/jest-dom#toberequired)
     */
    toBeRequired(): R
    /**
     * @description
     * Allows you to check if a form element is currently required.
     *
     * An `input`, `select`, `textarea`, or `form` element is invalid if it has an `aria-invalid` attribute with no
     * value or a value of "false", or if the result of `checkValidity()` is true.
     * @example
     * <input data-testid="aria-invalid" aria-invalid />
     *
     * <form data-testid="valid-form">
     *   <input />
     * </form>
     *
     * expect(getByTestId('no-aria-invalid')).not.toBeValid()
     * expect(getByTestId('invalid-form')).toBeInvalid()
     * @see
     * [testing-library/jest-dom#tobevalid](https://github.com/testing-library/jest-dom#tobevalid)
     */
    toBeValid(): R
    /**
     * @description
     * Allows you to assert whether an element contains another element as a descendant or not.
     * @example
     * <span data-testid="ancestor">
     *   <span data-testid="descendant"></span>
     * </span>
     *
     * const ancestor = getByTestId('ancestor')
     * const descendant = getByTestId('descendant')
     * const nonExistantElement = getByTestId('does-not-exist')
     * expect(ancestor).toContainElement(descendant)
     * expect(descendant).not.toContainElement(ancestor)
     * expect(ancestor).not.toContainElement(nonExistantElement)
     * @see
     * [testing-library/jest-dom#tocontainelement](https://github.com/testing-library/jest-dom#tocontainelement)
     */
    toContainElement(element: HTMLElement | SVGElement | null): R
    /**
     * @description
     * Assert whether a string representing a HTML element is contained in another element.
     * @example
     * <span data-testid="parent"><span data-testid="child"></span></span>
     *
     * expect(getByTestId('parent')).toContainHTML('<span data-testid="child"></span>')
     * @see
     * [testing-library/jest-dom#tocontainhtml](https://github.com/testing-library/jest-dom#tocontainhtml)
     */
    toContainHTML(htmlText: string): R
    /**
     * @description
     * Allows you to check if a given element has an attribute or not.
     *
     * You can also optionally check that the attribute has a specific expected value or partial match using
     * [expect.stringContaining](https://jestjs.io/docs/en/expect.html#expectnotstringcontainingstring) or
     * [expect.stringMatching](https://jestjs.io/docs/en/expect.html#expectstringmatchingstring-regexp).
     * @example
     * <button
     *   data-testid="ok-button"
     *   type="submit"
     *   disabled
     * >
     *   ok
     * </button>
     *
     * expect(button).toHaveAttribute('disabled')
     * expect(button).toHaveAttribute('type', 'submit')
     * expect(button).not.toHaveAttribute('type', 'button')
     * @see
     * [testing-library/jest-dom#tohaveattribute](https://github.com/testing-library/jest-dom#tohaveattribute)
     */
    toHaveAttribute(attr: string, value?: unknown): R
    /**
     * @description
     * Check whether the given element has certain classes within its `class` attribute.
     *
     * You must provide at least one class, unless you are asserting that an element does not have any classes.
     * @example
     * <button
     *   data-testid="delete-button"
     *   class="btn xs btn-danger"
     * >
     *   delete item
     * </button>
     *
     * <div data-testid="no-classes">no classes</div>
     *
     * const deleteButton = getByTestId('delete-button')
     * const noClasses = getByTestId('no-classes')
     * expect(deleteButton).toHaveClass('btn')
     * expect(deleteButton).toHaveClass('btn-danger xs')
     * expect(deleteButton).toHaveClass('btn xs btn-danger', {exact: true})
     * expect(deleteButton).not.toHaveClass('btn xs btn-danger', {exact: true})
     * expect(noClasses).not.toHaveClass()
     * @see
     * [testing-library/jest-dom#tohaveclass](https://github.com/testing-library/jest-dom#tohaveclass)
     */
    toHaveClass(...classNames: string[]): R
    toHaveClass(classNames: string, options?: {exact: boolean}): R
    /**
     * @description
     * This allows you to check whether the given form element has the specified displayed value (the one the
     * end user will see). It accepts <input>, <select> and <textarea> elements with the exception of <input type="checkbox">
     * and <input type="radio">, which can be meaningfully matched only using toBeChecked or toHaveFormValues.
     * @example
     * <label for="input-example">First name</label>
     * <input type="text" id="input-example" value="Luca" />
     *
     * <label for="textarea-example">Description</label>
     * <textarea id="textarea-example">An example description here.</textarea>
     *
     * <label for="single-select-example">Fruit</label>
     * <select id="single-select-example">
     *   <option value="">Select a fruit...</option>
     *   <option value="banana">Banana</option>
     *   <option value="ananas">Ananas</option>
     *   <option value="avocado">Avocado</option>
     * </select>
     *
     * <label for="mutiple-select-example">Fruits</label>
     * <select id="multiple-select-example" multiple>
     *   <option value="">Select a fruit...</option>
     *   <option value="banana" selected>Banana</option>
     *   <option value="ananas">Ananas</option>
     *   <option value="avocado" selected>Avocado</option>
     * </select>
     *
     * const input = screen.getByLabelText('First name')
     * const textarea = screen.getByLabelText('Description')
     * const selectSingle = screen.getByLabelText('Fruit')
     * const selectMultiple = screen.getByLabelText('Fruits')
     *
     * expect(input).toHaveDisplayValue('Luca')
     * expect(textarea).toHaveDisplayValue('An example description here.')
     * expect(selectSingle).toHaveDisplayValue('Select a fruit...')
     * expect(selectMultiple).toHaveDisplayValue(['Banana', 'Avocado'])
     *
     * @see
     * [testing-library/jest-dom#tohavedisplayvalue](https://github.com/testing-library/jest-dom#tohavedisplayvalue)
     */
    toHaveDisplayValue(value: string | RegExp | Array<string | RegExp>): R
    /**
     * @description
     * Assert whether an element has focus or not.
     * @example
     * <div>
     *   <input type="text" data-testid="element-to-focus" />
     * </div>
     *
     * const input = getByTestId('element-to-focus')
     * input.focus()
     * expect(input).toHaveFocus()
     * input.blur()
     * expect(input).not.toHaveFocus()
     * @see
     * [testing-library/jest-dom#tohavefocus](https://github.com/testing-library/jest-dom#tohavefocus)
     */
    toHaveFocus(): R
    /**
     * @description
     * Check if a form or fieldset contains form controls for each given name, and having the specified value.
     *
     * Can only be invoked on a form or fieldset element.
     * @example
     * <form data-testid="login-form">
     *   <input type="text" name="username" value="jane.doe" />
     *   <input type="password" name="password" value="123" />
     *   <input type="checkbox" name="rememberMe" checked />
     *   <button type="submit">Sign in</button>
     * </form>
     *
     * expect(getByTestId('login-form')).toHaveFormValues({
     *   username: 'jane.doe',
     *   rememberMe: true,
     * })
     * @see
     * [testing-library/jest-dom#tohaveformvalues](https://github.com/testing-library/jest-dom#tohaveformvalues)
     */
    toHaveFormValues(expectedValues: Record<string, unknown>): R
    /**
     * @description
     * Check if an element has specific css properties with specific values applied.
     *
     * Only matches if the element has *all* the expected properties applied, not just some of them.
     * @example
     * <button
     *   data-test-id="submit-button"
     *   style="background-color: green; display: none"
     * >
     *   submit
     * </button>
     *
     * const button = getByTestId('submit-button')
     * expect(button).toHaveStyle('background-color: green')
     * expect(button).toHaveStyle({
     *   'background-color': 'green',
     *   display: 'none'
     * })
     * @see
     * [testing-library/jest-dom#tohavestyle](https://github.com/testing-library/jest-dom#tohavestyle)
     */
    toHaveStyle(css: string | Record<string, unknown>): R
    /**
     * @description
     * Check whether the given element has a text content or not.
     *
     * When a string argument is passed through, it will perform a partial case-sensitive match to the element
     * content.
     *
     * To perform a case-insensitive match, you can use a RegExp with the `/i` modifier.
     *
     * If you want to match the whole content, you can use a RegExp to do it.
     * @example
     * <span data-testid="text-content">Text Content</span>
     *
     * const element = getByTestId('text-content')
     * expect(element).toHaveTextContent('Content')
     * // to match the whole content
     * expect(element).toHaveTextContent(/^Text Content$/)
     * // to use case-insentive match
     * expect(element).toHaveTextContent(/content$/i)
     * expect(element).not.toHaveTextContent('content')
     * @see
     * [testing-library/jest-dom#tohavetextcontent](https://github.com/testing-library/jest-dom#tohavetextcontent)
     */
    toHaveTextContent(
      text: string | RegExp,
      options?: {normalizeWhitespace: boolean},
    ): R
    /**
     * @description
     * Check whether the given form element has the specified value.
     *
     * Accepts `<input>`, `<select>`, and `<textarea>` elements with the exception of `<input type="checkbox">` and
     * `<input type="radiobox">`, which can be matched only using
     * [toBeChecked](https://github.com/testing-library/jest-dom#tobechecked) or
     * [toHaveFormValues](https://github.com/testing-library/jest-dom#tohaveformvalues).
     * @example
     * <input
     *   type="number"
     *   value="5"
     *   data-testid="input-number" />
     *
     * const numberInput = getByTestId('input-number')
     * expect(numberInput).toHaveValue(5)
     * @see
     * [testing-library/jest-dom#tohavevalue](https://github.com/testing-library/jest-dom#tohavevalue)
     */
    toHaveValue(value?: string | string[] | number | null): R
    /**
     * @description
     * Assert whether the given element is checked.
     *
     * It accepts an `input` of type `checkbox` or `radio` and elements with a `role` of `radio` with a valid
     * `aria-checked` attribute of "true" or "false".
     * @example
     * <input
     *   type="checkbox"
     *   checked
     *   data-testid="input-checkbox" />
     * <input
     *   type="radio"
     *   value="foo"
     *   data-testid="input-radio" />
     *
     * const inputCheckbox = getByTestId('input-checkbox')
     * const inputRadio = getByTestId('input-radio')
     * expect(inputCheckbox).toBeChecked()
     * expect(inputRadio).not.toBeChecked()
     * @see
     * [testing-library/jest-dom#tobechecked](https://github.com/testing-library/jest-dom#tobechecked)
     */
    toBeChecked(): R
    /**
     * @deprecated
     * since v5.14.1
     * @description
     * Check the accessible description for an element.
     * This allows you to check whether the given element has a description or not.
     *
     * An element gets its description via the
     * [`aria-describedby` attribute](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/ARIA_Techniques/Using_the_aria-describedby_attribute).
     * Set this to the `id` of one or more other elements. These elements may be nested
     * inside, be outside, or a sibling of the passed in element.
     *
     * Whitespace is normalized. Using multiple ids will
     * [join the referenced elements’ text content separated by a space](https://www.w3.org/TR/accname-1.1/#mapping_additional_nd_description).
     *
     * When a `string` argument is passed through, it will perform a whole
     * case-sensitive match to the description text.
     *
     * To perform a case-insensitive match, you can use a `RegExp` with the `/i`
     * modifier.
     *
     * To perform a partial match, you can pass a `RegExp` or use
     * `expect.stringContaining("partial string")`.
     *
     * @example
     * <button aria-label="Close" aria-describedby="description-close">
     *   X
     * </button>
     * <div id="description-close">
     *   Closing will discard any changes
     * </div>
     *
     * <button>Delete</button>
     *
     * const closeButton = getByRole('button', {name: 'Close'})
     *
     * expect(closeButton).toHaveDescription('Closing will discard any changes')
     * expect(closeButton).toHaveDescription(/will discard/) // to partially match
     * expect(closeButton).toHaveDescription(expect.stringContaining('will discard')) // to partially match
     * expect(closeButton).toHaveDescription(/^closing/i) // to use case-insensitive match
     * expect(closeButton).not.toHaveDescription('Other description')
     *
     * const deleteButton = getByRole('button', {name: 'Delete'})
     * expect(deleteButton).not.toHaveDescription()
     * expect(deleteButton).toHaveDescription('') // Missing or empty description always becomes a blank string
     * @see
     * [testing-library/jest-dom#tohavedescription](https://github.com/testing-library/jest-dom#tohavedescription)
     */
    toHaveDescription(text?: string | RegExp | E): R
    /**
     * @description
     * This allows to assert that an element has the expected [accessible description](https://w3c.github.io/accname/).
     *
     * You can pass the exact string of the expected accessible description, or you can make a
     * partial match passing a regular expression, or by using either
     * [expect.stringContaining](https://jestjs.io/docs/en/expect.html#expectnotstringcontainingstring)
     * or [expect.stringMatching](https://jestjs.io/docs/en/expect.html#expectstringmatchingstring-regexp).
     * @example
     * <a data-testid="link" href="/" aria-label="Home page" title="A link to start over">Start</a>
     * <a data-testid="extra-link" href="/about" aria-label="About page">About</a>
     * <img src="avatar.jpg" data-testid="avatar" alt="User profile pic" />
     * <img src="logo.jpg" data-testid="logo" alt="Company logo" aria-describedby="t1" />
     * <span id="t1" role="presentation">The logo of Our Company</span>
     *
     * expect(getByTestId('link')).toHaveAccessibleDescription()
     * expect(getByTestId('link')).toHaveAccessibleDescription('A link to start over')
     * expect(getByTestId('link')).not.toHaveAccessibleDescription('Home page')
     * expect(getByTestId('extra-link')).not.toHaveAccessibleDescription()
     * expect(getByTestId('avatar')).not.toHaveAccessibleDescription()
     * expect(getByTestId('logo')).not.toHaveAccessibleDescription('Company logo')
     * expect(getByTestId('logo')).toHaveAccessibleDescription('The logo of Our Company')
     * @see
     * [testing-library/jest-dom#tohaveaccessibledescription](https://github.com/testing-library/jest-dom#tohaveaccessibledescription)
     */
    toHaveAccessibleDescription(text?: string | RegExp | E): R

    /**
     * @description
     * This allows you to assert that an element has the expected
     * [accessible error message](https://w3c.github.io/aria/#aria-errormessage).
     *
     * You can pass the exact string of the expected accessible error message.
     * Alternatively, you can perform a partial match by passing a regular expression
     * or by using either
     * [expect.stringContaining](https://jestjs.io/docs/en/expect.html#expectnotstringcontainingstring)
     * or [expect.stringMatching](https://jestjs.io/docs/en/expect.html#expectstringmatchingstring-regexp).
     *
     * @example
     * <input aria-label="Has Error" aria-invalid="true" aria-errormessage="error-message" />
     * <div id="error-message" role="alert">This field is invalid</div>
     *
     * <input aria-label="No Error Attributes" />
     * <input aria-label="Not Invalid" aria-invalid="false" aria-errormessage="error-message" />
     *
     * // Inputs with Valid Error Messages
     * expect(getByRole('textbox', {name: 'Has Error'})).toHaveAccessibleErrorMessage()
     * expect(getByRole('textbox', {name: 'Has Error'})).toHaveAccessibleErrorMessage('This field is invalid')
     * expect(getByRole('textbox', {name: 'Has Error'})).toHaveAccessibleErrorMessage(/invalid/i)
     * expect(
     *   getByRole('textbox', {name: 'Has Error'}),
     * ).not.toHaveAccessibleErrorMessage('This field is absolutely correct!')
     *
     * // Inputs without Valid Error Messages
     * expect(
     *   getByRole('textbox', {name: 'No Error Attributes'}),
     * ).not.toHaveAccessibleErrorMessage()
     *
     * expect(
     *   getByRole('textbox', {name: 'Not Invalid'}),
     * ).not.toHaveAccessibleErrorMessage()
     *
     * @see
     * [testing-library/jest-dom#tohaveaccessibleerrormessage](https://github.com/testing-library/jest-dom#tohaveaccessibleerrormessage)
     */
    toHaveAccessibleErrorMessage(text?: string | RegExp | E): R

    /**
     * @description
     * This allows to assert that an element has the expected [accessible name](https://w3c.github.io/accname/).
     * It is useful, for instance, to assert that form elements and buttons are properly labelled.
     *
     * You can pass the exact string of the expected accessible name, or you can make a
     * partial match passing a regular expression, or by using either
     * [expect.stringContaining](https://jestjs.io/docs/en/expect.html#expectnotstringcontainingstring)
     * or [expect.stringMatching](https://jestjs.io/docs/en/expect.html#expectstringmatchingstring-regexp).
     * @example
     * <img data-testid="img-alt" src="" alt="Test alt" />
     * <img data-testid="img-empty-alt" src="" alt="" />
     * <svg data-testid="svg-title"><title>Test title</title></svg>
     * <button data-testid="button-img-alt"><img src="" alt="Test" /></button>
     * <p><img data-testid="img-paragraph" src="" alt="" /> Test content</p>
     * <button data-testid="svg-button"><svg><title>Test</title></svg></p>
     * <div><svg data-testid="svg-without-title"></svg></div>
     * <input data-testid="input-title" title="test" />
     *
     * expect(getByTestId('img-alt')).toHaveAccessibleName('Test alt')
     * expect(getByTestId('img-empty-alt')).not.toHaveAccessibleName()
     * expect(getByTestId('svg-title')).toHaveAccessibleName('Test title')
     * expect(getByTestId('button-img-alt')).toHaveAccessibleName()
     * expect(getByTestId('img-paragraph')).not.toHaveAccessibleName()
     * expect(getByTestId('svg-button')).toHaveAccessibleName()
     * expect(getByTestId('svg-without-title')).not.toHaveAccessibleName()
     * expect(getByTestId('input-title')).toHaveAccessibleName()
     * @see
     * [testing-library/jest-dom#tohaveaccessiblename](https://github.com/testing-library/jest-dom#tohaveaccessiblename)
     */
    toHaveAccessibleName(text?: string | RegExp | E): R
    /**
     * @description
     * This allows you to check whether the given element is partially checked.
     * It accepts an input of type checkbox and elements with a role of checkbox
     * with a aria-checked="mixed", or input of type checkbox with indeterminate
     * set to true
     *
     * @example
     * <input type="checkbox" aria-checked="mixed" data-testid="aria-checkbox-mixed" />
     * <input type="checkbox" checked data-testid="input-checkbox-checked" />
     * <input type="checkbox" data-testid="input-checkbox-unchecked" />
     * <div role="checkbox" aria-checked="true" data-testid="aria-checkbox-checked" />
     * <div
     *   role="checkbox"
     *   aria-checked="false"
     *   data-testid="aria-checkbox-unchecked"
     * />
     * <input type="checkbox" data-testid="input-checkbox-indeterminate" />
     *
     * const ariaCheckboxMixed = getByTestId('aria-checkbox-mixed')
     * const inputCheckboxChecked = getByTestId('input-checkbox-checked')
     * const inputCheckboxUnchecked = getByTestId('input-checkbox-unchecked')
     * const ariaCheckboxChecked = getByTestId('aria-checkbox-checked')
     * const ariaCheckboxUnchecked = getByTestId('aria-checkbox-unchecked')
     * const inputCheckboxIndeterminate = getByTestId('input-checkbox-indeterminate')
     *
     * expect(ariaCheckboxMixed).toBePartiallyChecked()
     * expect(inputCheckboxChecked).not.toBePartiallyChecked()
     * expect(inputCheckboxUnchecked).not.toBePartiallyChecked()
     * expect(ariaCheckboxChecked).not.toBePartiallyChecked()
     * expect(ariaCheckboxUnchecked).not.toBePartiallyChecked()
     *
     * inputCheckboxIndeterminate.indeterminate = true
     * expect(inputCheckboxIndeterminate).toBePartiallyChecked()
     * @see
     * [testing-library/jest-dom#tobepartiallychecked](https://github.com/testing-library/jest-dom#tobepartiallychecked)
     */
    toBePartiallyChecked(): R
    /**
     * @deprecated
     * since v5.17.0
     *
     * @description
     * Check whether the given element has an [ARIA error message](https://www.w3.org/TR/wai-aria/#aria-errormessage) or not.
     *
     * Use the `aria-errormessage` attribute to reference another element that contains
     * custom error message text. Multiple ids is **NOT** allowed. Authors MUST use
     * `aria-invalid` in conjunction with `aria-errormessage`. Learn more from the
     * [`aria-errormessage` spec](https://www.w3.org/TR/wai-aria/#aria-errormessage).
     *
     * Whitespace is normalized.
     *
     * When a `string` argument is passed through, it will perform a whole
     * case-sensitive match to the error message text.
     *
     * To perform a case-insensitive match, you can use a `RegExp` with the `/i`
     * modifier.
     *
     * To perform a partial match, you can pass a `RegExp` or use
     * expect.stringContaining("partial string")`.
     *
     * @example
     * <label for="startTime"> Please enter a start time for the meeting: </label>
     * <input id="startTime" type="text" aria-errormessage="msgID" aria-invalid="true" value="11:30 PM" />
     * <span id="msgID" aria-live="assertive" style="visibility:visible">
     *   Invalid time: the time must be between 9:00 AM and 5:00 PM"
     * </span>
     *
     *
     * const timeInput = getByLabel('startTime')
     *
     * expect(timeInput).toHaveErrorMessage(
     *   'Invalid time: the time must be between 9:00 AM and 5:00 PM',
     * )
     * expect(timeInput).toHaveErrorMessage(/invalid time/i) // to partially match
     * expect(timeInput).toHaveErrorMessage(expect.stringContaining('Invalid time')) // to partially match
     * expect(timeInput).not.toHaveErrorMessage('Pikachu!')
     * @see
     * [testing-library/jest-dom#tohaveerrormessage](https://github.com/testing-library/jest-dom#tohaveerrormessage)
     */
    toHaveErrorMessage(text?: string | RegExp | E): R
  }
}

// Needs to extend Record<string, any> to be accepted by expect.extend()
// as it requires a string index signature.
declare const matchers: matchers.TestingLibraryMatchers<any, void> &
  Record<string, any>

declare namespace matchers$1 {
  export {
    matchers as default,
  };
}

/** Private lookup for assertions created by the genuine pinned primitives. */
declare function getChaiAssertionIdentity(
  value: unknown
): object | undefined

/** Private pure upstream helper factories; these do not register origins. */
declare function createChaiAssertInterface(
  assertion: typeof chai.Assertion,
  flag: typeof chai.util.flag
): typeof chai.assert
declare function createChaiShouldInterface(
  assertion: typeof chai.Assertion
): typeof chai.should


declare function createTimerContext(
  global: typeof globalThis
): TimerContext

export { ASYMMETRIC_MATCHERS_OBJECT, Any, Anything, ArrayContaining, AsymmetricMatcher, ChaiStyleAssertions, GLOBAL_EXPECT, JEST_MATCHERS_OBJECT, JestAsymmetricMatchers, JestChaiExpect, JestExtend, MATCHERS_OBJECT, ObjectContaining, SchemaMatching, SnapshotClient, StringContaining, StringMatching, addCustomEqualityTesters, addSerializer, arrayBufferEquality, createAssertionMessage, createChaiAssertInterface, createChaiShouldInterface, createTimerContext, customMatchers, matchers$1 as domMatchers, equals, expectTypeOf, fnNameFor, format, generateToBeMessage, getChaiAssertionIdentity, getCustomEqualityTesters, getObjectKeys, getObjectSubset, getSerializers, getState, hasAsymmetric, hasProperty, inspect, isA, isAsymmetric, isError, isImmutableUnorderedKeyed, isImmutableUnorderedSet, isStandardSchema, iterableEquality, mockObject, pluralize, prettyDOM, queries, recordAsyncExpect, setState, sparseArrayEquality, index_d as spies, stringify, stripSnapshotIndentation, subsetEquality, typeEquality, wrapAssertion };
export type { Assertion, AsymmetricMatcherInterface, AsymmetricMatchersContaining, AsyncExpectationResult, ChaiMockAssertion, ChaiPlugin, DeeplyAllowMatchers, DiffOptions, ExpectStatic, ExpectTypeOf, ExpectationResult, JestAssertion, MatcherHintOptions, MatcherState, Matchers, MatchersObject, MaybeMockedDeep, Mock, MockContext, Disposable as MockDisposable, MockInstance, MockResult, MockResultIncomplete, MockResultReturn, MockResultThrow, MockSettledResult, MockSettledResultFulfilled, MockSettledResultIncomplete, MockSettledResultRejected, Mocked, MockedClass, MockedFunction, MockedObject, PromisifyAssertion, RawMatcherFn, SnapshotResult, SnapshotStateOptions, SyncExpectationResult, TestError, Tester, TesterContext };
