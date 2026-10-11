import * as chai from './chai';
export { chai };

/* eslint-disable ts/ban-ts-comment */

interface Disposable {
  // @ts-ignore -- Symbol.dispose might not be in user types
  [Symbol.dispose]: () => void
}

interface MockResultReturn<T> {
	type: "return";
	/**
	* The value that was returned from the function. If function returned a Promise, then this will be a resolved value.
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
	* This is an array containing all instances that were instantiated when mock was called with a `new` keyword. Note that this is an actual context (`this`) of the function, not a return value.
	* @see https://vitest.dev/api/mock#mock-instances
	*/
	instances: MockProcedureContext<T>[];
	/**
	* An array of `this` values that were used during each call to the mock function.
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
	* This array will be empty if the function was never resolved or rejected.
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
type NormalizedProcedure<T extends Procedure | Constructable> = T extends Constructable ? ({
	new (...args: ConstructorParameters<T>): InstanceType<T>;
}) | ({
	(this: InstanceType<T>, ...args: ConstructorParameters<T>): void;
}) : T extends Procedure ? (...args: Parameters<T>) => ReturnType<T> : never;
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
	* Returns current permanent mock implementation if there is one.
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
	* Accepts a value that will be returned whenever the mock function is called. TypeScript will only accept values that match the return type of the original function.
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
type Mock<T extends Procedure | Constructable = Procedure> = MockInstance<T> & (T extends Constructable ? (T extends Procedure ? {
	new (...args: ConstructorParameters<T>): InstanceType<T>;
	(...args: Parameters<T>): ReturnType<T>;
} : {
	new (...args: ConstructorParameters<T>): InstanceType<T>;
}) : {
	new (...args: MockParameters<T>): MockReturnType<T>;
	(...args: MockParameters<T>): MockReturnType<T>;
}) & { [P in keyof T]: T[P] };
type PartialMaybePromise<T> = T extends Promise<Awaited<T>> ? Promise<Partial<Awaited<T>>> : Partial<T>;
type PartialResultFunction<T> = T extends Constructable ? ({
	new (...args: ConstructorParameters<T>): InstanceType<T>;
}) | ({
	(this: InstanceType<T>, ...args: ConstructorParameters<T>): void;
}) : T extends Procedure ? (...args: Parameters<T>) => PartialMaybePromise<ReturnType<T>> : T;
type PartialMock<T extends Procedure | Constructable = Procedure> = Mock<PartialResultFunction<T extends Mock ? NonNullable<ReturnType<T["getMockImplementation"]>> : T>>;
type DeepPartial<T> = T extends Procedure ? T : T extends Array<infer U> ? Array<DeepPartial<U>> : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
type DeepPartialMaybePromise<T> = T extends Promise<Awaited<T>> ? Promise<DeepPartial<Awaited<T>>> : DeepPartial<T>;
type DeepPartialResultFunction<T> = T extends Constructable ? ({
	new (...args: ConstructorParameters<T>): InstanceType<T>;
}) | ({
	(this: InstanceType<T>, ...args: ConstructorParameters<T>): void;
}) : T extends Procedure ? (...args: Parameters<T>) => DeepPartialMaybePromise<ReturnType<T>> : T;
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
interface Colors {
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
type Indent = (arg0: string) => string;
type Refs = Array<unknown>;
type Print = (arg0: unknown) => string;
/**
* compare function used when sorting object keys, `null` can be used to skip over sorting.
*/
type CompareKeys = ((a: string, b: string) => number) | null | undefined;
interface PrettyFormatOptions {
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
	compareKeys?: CompareKeys;
	/**
	* Plugins used to serialize application-specific data types.
	* @default []
	*/
	plugins?: Plugins;
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
type OptionsReceived = PrettyFormatOptions;
interface Config {
	callToJSON: boolean;
	compareKeys: CompareKeys;
	colors: Colors;
	escapeRegex: boolean;
	escapeString: boolean;
	indent: string;
	maxDepth: number;
	maxWidth: number;
	min: boolean;
	plugins: Plugins;
	printBasicPrototype: boolean;
	printFunctionName: boolean;
	printShadowRoot: boolean;
	spacingInner: string;
	spacingOuter: string;
	singleQuote: boolean;
	quoteKeys: boolean;
	maxOutputLength: number;
}
type Printer = (val: unknown, config: Config, indentation: string, depth: number, refs: Refs, hasCalledToJSON?: boolean) => string;
type Test = (arg0: any) => boolean;
interface NewPlugin {
	serialize: (val: any, config: Config, indentation: string, depth: number, refs: Refs, printer: Printer) => string;
	test: Test;
}
interface PluginOptions {
	edgeSpacing: string;
	min: boolean;
	spacing: string;
}
interface OldPlugin {
	print: (val: unknown, print: Print, indent: Indent, options: PluginOptions, colors: Colors) => string;
	test: Test;
}
type Plugin = NewPlugin | OldPlugin;
type Plugins = Array<Plugin>;

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
	compareKeys?: CompareKeys;
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

interface StringifyOptions extends PrettyFormatOptions {
	maxLength?: number;
	filterNode?: string | ((node: any) => boolean);
}
declare function stringify(object: unknown, maxDepth?: number, { maxLength, filterNode, ...options }?: StringifyOptions): string;

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

interface ParsedStack {
	method: string;
	file: string;
	line: number;
	column: number;
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
interface SnapshotEnvironmentOptions {
	snapshotsDirName?: string;
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
	pack(): Promise<SnapshotResult>;
}
type SnapshotUpdateState = "all" | "new" | "none";
interface SnapshotStateOptions {
	updateSnapshot: SnapshotUpdateState;
	snapshotEnvironment: SnapshotEnvironment;
	expand?: boolean;
	snapshotFormat?: OptionsReceived;
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

declare class NodeSnapshotEnvironment implements SnapshotEnvironment {
	private options;
	constructor(options?: SnapshotEnvironmentOptions);
	getVersion(): string;
	getHeader(): string;
	resolveRawPath(testPath: string, rawPath: string): Promise<string>;
	resolvePath(filepath: string): Promise<string>;
	prepareDirectory(dirPath: string): Promise<void>;
	saveSnapshotFile(filepath: string, snapshot: string): Promise<void>;
	readSnapshotFile(filepath: string): Promise<string | null>;
	removeSnapshotFile(filepath: string): Promise<void>;
}

export { ASYMMETRIC_MATCHERS_OBJECT, Any, Anything, ArrayContaining, AsymmetricMatcher, ChaiStyleAssertions, GLOBAL_EXPECT, JEST_MATCHERS_OBJECT, JestAsymmetricMatchers, JestChaiExpect, JestExtend, MATCHERS_OBJECT, NodeSnapshotEnvironment, ObjectContaining, SchemaMatching, SnapshotClient, StringContaining, StringMatching, addCustomEqualityTesters, arrayBufferEquality, createAssertionMessage, customMatchers, equals, fnNameFor, generateToBeMessage, getCustomEqualityTesters, getObjectKeys, getObjectSubset, getState, hasAsymmetric, hasProperty, isA, isAsymmetric, isError, isImmutableUnorderedKeyed, isImmutableUnorderedSet, isStandardSchema, iterableEquality, pluralize, recordAsyncExpect, setState, sparseArrayEquality, index_d as spies, subsetEquality, typeEquality, wrapAssertion };
export type { Assertion, AsymmetricMatcherInterface, AsymmetricMatchersContaining, AsyncExpectationResult, ChaiMockAssertion, ChaiPlugin, DeeplyAllowMatchers, DiffOptions, ExpectStatic, ExpectationResult, JestAssertion, MatcherHintOptions, MatcherState, Matchers, MatchersObject, Mock, MockInstance, PromisifyAssertion, RawMatcherFn, SnapshotResult, SnapshotStateOptions, SyncExpectationResult, Tester, TesterContext };
