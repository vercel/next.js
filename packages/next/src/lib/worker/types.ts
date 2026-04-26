// ---------------------------------------------------------------------------
// Message type constants for parent ↔ child IPC communication.
//
// Child messages (parent → child):
//   INITIALIZE  Load the worker module and optionally call its setup() function.
//   CALL        Invoke an exported method in the worker module.
//   END         Gracefully shut down the worker process.
//
// Parent messages (child → parent):
//   OK           A CALL completed successfully — carries the return value.
//   CLIENT_ERROR A CALL threw an error — carries serialized error details.
//   SETUP_ERROR  The setup() function threw during initialization.
//   CUSTOM       An arbitrary message sent by the worker via process.send().
//   READY        The worker has finished loading its module and running setup().
// ---------------------------------------------------------------------------

/** Load the worker module and optionally call its setup() function */
export const CHILD_MESSAGE_INITIALIZE = 0
/** Invoke an exported method in the worker module */
export const CHILD_MESSAGE_CALL = 1
/** Gracefully shut down the worker process */
export const CHILD_MESSAGE_END = 2

/** A CALL completed successfully — carries the return value */
export const PARENT_MESSAGE_OK = 0
/** A CALL threw an error — carries serialized error details */
export const PARENT_MESSAGE_CLIENT_ERROR = 1
/** The setup() function threw during initialization */
export const PARENT_MESSAGE_SETUP_ERROR = 2
/** An arbitrary message sent by the worker via process.send() */
export const PARENT_MESSAGE_CUSTOM = 3
/** The worker has finished loading its module and running setup() */
export const PARENT_MESSAGE_READY = 4

// Parent → Child message types
export type ChildMessageInitialize = [
  type: typeof CHILD_MESSAGE_INITIALIZE,
  workerPath: string,
  setupArgs: unknown[],
]

export type ChildMessageCall = [
  type: typeof CHILD_MESSAGE_CALL,
  requestId: number,
  methodName: string,
  args: unknown[],
]

export type ChildMessageEnd = [type: typeof CHILD_MESSAGE_END]

export type ChildMessage =
  | ChildMessageInitialize
  | ChildMessageCall
  | ChildMessageEnd

// Child → Parent message types
export type ParentMessageOk = [
  type: typeof PARENT_MESSAGE_OK,
  requestId: number,
  result: unknown,
]

export type ParentMessageClientError = [
  type: typeof PARENT_MESSAGE_CLIENT_ERROR,
  requestId: number,
  errorName: string,
  errorMessage: string,
  errorStack: string | undefined,
  errorProperties: Record<string, unknown> | unknown,
]

export type ParentMessageSetupError = [
  type: typeof PARENT_MESSAGE_SETUP_ERROR,
  errorName: string,
  errorMessage: string,
  errorStack: string | undefined,
]

export type ParentMessageCustom = [
  type: typeof PARENT_MESSAGE_CUSTOM,
  payload: unknown,
]

export type ParentMessageReady = [type: typeof PARENT_MESSAGE_READY]

export type ParentMessage =
  | ParentMessageOk
  | ParentMessageClientError
  | ParentMessageSetupError
  | ParentMessageCustom
  | ParentMessageReady
