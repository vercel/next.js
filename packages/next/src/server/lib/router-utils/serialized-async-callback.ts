export function createSerializedAsyncCallback<T>(
  callback: (value: T) => Promise<void>
) {
  let previous = Promise.resolve()

  return async function serializedCallback(value: T) {
    const waitForPrevious = previous
    let release!: () => void
    previous = new Promise<void>((resolve) => {
      release = resolve
    })

    await waitForPrevious
    try {
      await callback(value)
    } finally {
      release()
    }
  }
}
