// Message type constants for parent ↔ child communication
export const CHILD_MESSAGE_INITIALIZE = 0
export const CHILD_MESSAGE_CALL = 1
export const CHILD_MESSAGE_END = 2

export const PARENT_MESSAGE_OK = 0
export const PARENT_MESSAGE_CLIENT_ERROR = 1
export const PARENT_MESSAGE_SETUP_ERROR = 2
export const PARENT_MESSAGE_CUSTOM = 3
export const PARENT_MESSAGE_READY = 4

// Parent → Child message types
export type ChildMessageInitialize = [
  type: typeof CHILD_MESSAGE_INITIALIZE,
  reserved: false,
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
