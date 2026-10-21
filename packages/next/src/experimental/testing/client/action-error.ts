/** Only an executed native action can issue a recoverable command rejection. */
export class ClientBrowserActionError extends Error {
  readonly actionError: { name: string; message: string; stack?: string }
  constructor(error: unknown) {
    const original = error instanceof Error ? error : new Error(String(error))
    super(original.message, { cause: error })
    this.actionError = {
      name: original.name,
      message: original.message,
      stack: original.stack,
    }
  }
}

export async function runClientBrowserAction<T>(perform: () => Promise<T>) {
  try {
    return await perform()
  } catch (error) {
    throw new ClientBrowserActionError(error)
  }
}
