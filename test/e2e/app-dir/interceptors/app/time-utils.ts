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
