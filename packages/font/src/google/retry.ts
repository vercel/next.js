export async function retry<T>(
  fn: () => Promise<T>,
  attempts: number
): Promise<T> {
  let cnt = attempts
  while (true) {
    try {
      return await fn()
    } catch (err) {
      cnt--
      if (cnt <= 0) throw err
      console.error(
        (err as Error).message + `\n\nRetrying ${attempts - cnt}/3...`
      )
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}
