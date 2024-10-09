export function createTimeStamp() {
  return new Date().toISOString().split('T').at(-1)!.slice(0, -1)
}

export async function logWithTime(
  message: string,
  callback: () => Promise<void>
): Promise<void> {
  console.log(createTimeStamp(), `${message}, start`)
  await callback()
  console.log(createTimeStamp(), `${message}, finish`)
}

export async function setTimeout<T = void>(
  delay?: number,
  value?: T
): Promise<T> {
  return new Promise((resolve) =>
    globalThis.setTimeout(() => resolve(value), delay)
  )
}
