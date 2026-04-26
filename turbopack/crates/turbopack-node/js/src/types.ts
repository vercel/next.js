export type Channel<IM, RM> = {
  sendInfo(message: IM): Promise<void>
  sendRequest(message: RM): Promise<unknown>
  sendError(error: Error): Promise<void>
}
