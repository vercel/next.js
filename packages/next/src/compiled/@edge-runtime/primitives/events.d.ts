/**
 * An implementation of the `EventTarget` interface.
 * @see https://dom.spec.whatwg.org/#eventtarget
 */
declare class EventTarget<TEventMap extends Record<string, Event$1> = Record<string, Event$1>, TMode extends "standard" | "strict" = "standard"> {
	/**
	 * Initialize this instance.
	 */
	constructor();
	/**
	 * Add an event listener.
	 * @param type The event type.
	 * @param callback The event listener.
	 * @param options Options.
	 */
	addEventListener<T extends string & keyof TEventMap>(type: T, callback?: EventTarget.EventListener<this, TEventMap[T]> | null, options?: EventTarget.AddOptions): void;
	/**
	 * Add an event listener.
	 * @param type The event type.
	 * @param callback The event listener.
	 * @param options Options.
	 */
	addEventListener(type: string, callback?: EventTarget.FallbackEventListener<this, TMode>, options?: EventTarget.AddOptions): void;
	/**
	 * Add an event listener.
	 * @param type The event type.
	 * @param callback The event listener.
	 * @param capture The capture flag.
	 * @deprecated Use `{capture: boolean}` object instead of a boolean value.
	 */
	addEventListener<T extends string & keyof TEventMap>(type: T, callback: EventTarget.EventListener<this, TEventMap[T]> | null | undefined, capture: boolean): void;
	/**
	 * Add an event listener.
	 * @param type The event type.
	 * @param callback The event listener.
	 * @param capture The capture flag.
	 * @deprecated Use `{capture: boolean}` object instead of a boolean value.
	 */
	addEventListener(type: string, callback: EventTarget.FallbackEventListener<this, TMode>, capture: boolean): void;
	/**
	 * Remove an added event listener.
	 * @param type The event type.
	 * @param callback The event listener.
	 * @param options Options.
	 */
	removeEventListener<T extends string & keyof TEventMap>(type: T, callback?: EventTarget.EventListener<this, TEventMap[T]> | null, options?: EventTarget.Options): void;
	/**
	 * Remove an added event listener.
	 * @param type The event type.
	 * @param callback The event listener.
	 * @param options Options.
	 */
	removeEventListener(type: string, callback?: EventTarget.FallbackEventListener<this, TMode>, options?: EventTarget.Options): void;
	/**
	 * Remove an added event listener.
	 * @param type The event type.
	 * @param callback The event listener.
	 * @param capture The capture flag.
	 * @deprecated Use `{capture: boolean}` object instead of a boolean value.
	 */
	removeEventListener<T extends string & keyof TEventMap>(type: T, callback: EventTarget.EventListener<this, TEventMap[T]> | null | undefined, capture: boolean): void;
	/**
	 * Remove an added event listener.
	 * @param type The event type.
	 * @param callback The event listener.
	 * @param capture The capture flag.
	 * @deprecated Use `{capture: boolean}` object instead of a boolean value.
	 */
	removeEventListener(type: string, callback: EventTarget.FallbackEventListener<this, TMode>, capture: boolean): void;
	/**
	 * Dispatch an event.
	 * @param event The `Event` object to dispatch.
	 */
	dispatchEvent<T extends string & keyof TEventMap>(event: EventTarget.EventData<TEventMap, TMode, T>): boolean;
	/**
	 * Dispatch an event.
	 * @param event The `Event` object to dispatch.
	 */
	dispatchEvent(event: EventTarget.FallbackEvent<TMode>): boolean;
}
declare namespace EventTarget {
	/**
	 * The event listener.
	 */
	type EventListener<TEventTarget extends EventTarget<any, any>, TEvent extends Event$1> = CallbackFunction<TEventTarget, TEvent> | CallbackObject<TEvent>;
	/**
	 * The event listener function.
	 */
	interface CallbackFunction<TEventTarget extends EventTarget<any, any>, TEvent extends Event$1> {
		(this: TEventTarget, event: TEvent): void;
	}
	/**
	 * The event listener object.
	 * @see https://dom.spec.whatwg.org/#callbackdef-eventlistener
	 */
	interface CallbackObject<TEvent extends Event$1> {
		handleEvent(event: TEvent): void;
	}
	/**
	 * The common options for both `addEventListener` and `removeEventListener` methods.
	 * @see https://dom.spec.whatwg.org/#dictdef-eventlisteneroptions
	 */
	interface Options {
		capture?: boolean;
	}
	/**
	 * The options for the `addEventListener` methods.
	 * @see https://dom.spec.whatwg.org/#dictdef-addeventlisteneroptions
	 */
	interface AddOptions extends Options {
		passive?: boolean;
		once?: boolean;
		signal?: AbortSignal | null | undefined;
	}
	/**
	 * The abort signal.
	 * @see https://dom.spec.whatwg.org/#abortsignal
	 */
	interface AbortSignal extends EventTarget<{
		abort: Event$1;
	}> {
		readonly aborted: boolean;
		onabort: CallbackFunction<this, Event$1> | null;
	}
	/**
	 * The event data to dispatch in strict mode.
	 */
	type EventData<TEventMap extends Record<string, Event$1>, TMode extends "standard" | "strict", TEventType extends string> = TMode extends "strict" ? IsValidEventMap<TEventMap> extends true ? ExplicitType<TEventType> & Omit<TEventMap[TEventType], keyof Event$1> & Partial<Omit<Event$1, "type">> : never : never;
	/**
	 * Define explicit `type` property if `T` is a string literal.
	 * Otherwise, never.
	 */
	type ExplicitType<T extends string> = string extends T ? never : {
		readonly type: T;
	};
	/**
	 * The event listener type in standard mode.
	 * Otherwise, never.
	 */
	type FallbackEventListener<TEventTarget extends EventTarget<any, any>, TMode extends "standard" | "strict"> = TMode extends "standard" ? EventListener<TEventTarget, Event$1> | null | undefined : never;
	/**
	 * The event type in standard mode.
	 * Otherwise, never.
	 */
	type FallbackEvent<TMode extends "standard" | "strict"> = TMode extends "standard" ? Event$1 : never;
	/**
	 * Check if given event map is valid.
	 * It's valid if the keys of the event map are narrower than `string`.
	 */
	type IsValidEventMap<T> = string extends keyof T ? false : true;
}
/**
 * An implementation of `Event` interface, that wraps a given event object.
 * `EventTarget` shim can control the internal state of this `Event` objects.
 * @see https://dom.spec.whatwg.org/#event
 */
declare class Event$1<TEventType extends string = string> {
	/**
	 * @see https://dom.spec.whatwg.org/#dom-event-none
	 */
	static get NONE(): number;
	/**
	 * @see https://dom.spec.whatwg.org/#dom-event-capturing_phase
	 */
	static get CAPTURING_PHASE(): number;
	/**
	 * @see https://dom.spec.whatwg.org/#dom-event-at_target
	 */
	static get AT_TARGET(): number;
	/**
	 * @see https://dom.spec.whatwg.org/#dom-event-bubbling_phase
	 */
	static get BUBBLING_PHASE(): number;
	/**
	 * Initialize this event instance.
	 * @param type The type of this event.
	 * @param eventInitDict Options to initialize.
	 * @see https://dom.spec.whatwg.org/#dom-event-event
	 */
	constructor(type: TEventType, eventInitDict?: Event$1.EventInit);
	/**
	 * The type of this event.
	 * @see https://dom.spec.whatwg.org/#dom-event-type
	 */
	get type(): TEventType;
	/**
	 * The event target of the current dispatching.
	 * @see https://dom.spec.whatwg.org/#dom-event-target
	 */
	get target(): EventTarget | null;
	/**
	 * The event target of the current dispatching.
	 * @deprecated Use the `target` property instead.
	 * @see https://dom.spec.whatwg.org/#dom-event-srcelement
	 */
	get srcElement(): EventTarget | null;
	/**
	 * The event target of the current dispatching.
	 * @see https://dom.spec.whatwg.org/#dom-event-currenttarget
	 */
	get currentTarget(): EventTarget | null;
	/**
	 * The event target of the current dispatching.
	 * This doesn't support node tree.
	 * @see https://dom.spec.whatwg.org/#dom-event-composedpath
	 */
	composedPath(): EventTarget[];
	/**
	 * @see https://dom.spec.whatwg.org/#dom-event-none
	 */
	get NONE(): number;
	/**
	 * @see https://dom.spec.whatwg.org/#dom-event-capturing_phase
	 */
	get CAPTURING_PHASE(): number;
	/**
	 * @see https://dom.spec.whatwg.org/#dom-event-at_target
	 */
	get AT_TARGET(): number;
	/**
	 * @see https://dom.spec.whatwg.org/#dom-event-bubbling_phase
	 */
	get BUBBLING_PHASE(): number;
	/**
	 * The current event phase.
	 * @see https://dom.spec.whatwg.org/#dom-event-eventphase
	 */
	get eventPhase(): number;
	/**
	 * Stop event bubbling.
	 * Because this shim doesn't support node tree, this merely changes the `cancelBubble` property value.
	 * @see https://dom.spec.whatwg.org/#dom-event-stoppropagation
	 */
	stopPropagation(): void;
	/**
	 * `true` if event bubbling was stopped.
	 * @deprecated
	 * @see https://dom.spec.whatwg.org/#dom-event-cancelbubble
	 */
	get cancelBubble(): boolean;
	/**
	 * Stop event bubbling if `true` is set.
	 * @deprecated Use the `stopPropagation()` method instead.
	 * @see https://dom.spec.whatwg.org/#dom-event-cancelbubble
	 */
	set cancelBubble(value: boolean);
	/**
	 * Stop event bubbling and subsequent event listener callings.
	 * @see https://dom.spec.whatwg.org/#dom-event-stopimmediatepropagation
	 */
	stopImmediatePropagation(): void;
	/**
	 * `true` if this event will bubble.
	 * @see https://dom.spec.whatwg.org/#dom-event-bubbles
	 */
	get bubbles(): boolean;
	/**
	 * `true` if this event can be canceled by the `preventDefault()` method.
	 * @see https://dom.spec.whatwg.org/#dom-event-cancelable
	 */
	get cancelable(): boolean;
	/**
	 * `true` if the default behavior will act.
	 * @deprecated Use the `defaultPrevented` proeprty instead.
	 * @see https://dom.spec.whatwg.org/#dom-event-returnvalue
	 */
	get returnValue(): boolean;
	/**
	 * Cancel the default behavior if `false` is set.
	 * @deprecated Use the `preventDefault()` method instead.
	 * @see https://dom.spec.whatwg.org/#dom-event-returnvalue
	 */
	set returnValue(value: boolean);
	/**
	 * Cancel the default behavior.
	 * @see https://dom.spec.whatwg.org/#dom-event-preventdefault
	 */
	preventDefault(): void;
	/**
	 * `true` if the default behavior was canceled.
	 * @see https://dom.spec.whatwg.org/#dom-event-defaultprevented
	 */
	get defaultPrevented(): boolean;
	/**
	 * @see https://dom.spec.whatwg.org/#dom-event-composed
	 */
	get composed(): boolean;
	/**
	 * @see https://dom.spec.whatwg.org/#dom-event-istrusted
	 */
	get isTrusted(): boolean;
	/**
	 * @see https://dom.spec.whatwg.org/#dom-event-timestamp
	 */
	get timeStamp(): number;
	/**
	 * @deprecated Don't use this method. The constructor did initialization.
	 */
	initEvent(type: string, bubbles?: boolean, cancelable?: boolean): void;
}
declare namespace Event$1 {
	/**
	 * The options of the `Event` constructor.
	 * @see https://dom.spec.whatwg.org/#dictdef-eventinit
	 */
	interface EventInit {
		bubbles?: boolean;
		cancelable?: boolean;
		composed?: boolean;
	}
}

declare const EventTargetConstructor: typeof EventTarget
declare const EventConstructor: typeof Event

declare class FetchEvent {
  request: Request
  response: Response | null
  awaiting: Set<Promise<void>>
  constructor(request: Request)
  respondWith(response: Response | Promise<Response>): void
  waitUntil(promise: Promise<void>): void
}

export { EventConstructor as Event, EventTargetConstructor as EventTarget, FetchEvent, EventTarget as PromiseRejectionEvent };
