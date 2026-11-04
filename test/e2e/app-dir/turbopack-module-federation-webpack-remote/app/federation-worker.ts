self.addEventListener('message', async () => {
  try {
    // @ts-expect-error -- provided by Module Federation at runtime
    const remote = await import('workerCatalog/message')
    self.postMessage({ value: remote.message })
  } catch (error) {
    self.postMessage({
      error: (error as Error).stack ?? (error as Error).message,
    })
  }
})
