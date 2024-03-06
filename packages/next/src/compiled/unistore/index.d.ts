// T - Wrapped component props
// S - Wrapped component state
// K - Store state
// I - Injected props to wrapped component

export type Listener<K> = (state: K, action?: Action<K>) => void;
export type Unsubscribe = () => void;
export type Action<K> = (state: K, ...args: any[]) => void;
export type BoundAction = (...args: any[]) => void;

export interface Store<K> {
	action(action: Action<K>): BoundAction;
	setState<U extends keyof K>(update: Pick<K, U>, overwrite?: boolean, action?: Action<K>): void;
	subscribe(f: Listener<K>): Unsubscribe;
	unsubscribe(f: Listener<K>): void;
	getState(): K;
}

export default function createStore<K>(state?: K): Store<K>;

export type ActionFn<K> = (state: K, ...args: any[]) => Promise<Partial<K>> | Partial<K> | void;

export interface ActionMap<K> {
	[actionName: string]: ActionFn<K>;
}

export type ActionCreator<K> = (store: Store<K>) => ActionMap<K>;

export type StateMapper<T, K, I> = (state: K, props: T) => I;
