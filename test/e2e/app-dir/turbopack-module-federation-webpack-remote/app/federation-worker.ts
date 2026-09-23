self.addEventListener('message', async () => {
  try {
    // @ts-expect-error -- provided by Module Federation at runtime
    const remote = await import('workerCatalog/message')
    const instances = (self as any).__FEDERATION__?.__INSTANCES__ ?? []
    const producer = instances.find(
      (instance) => instance.options.name === 'workerCatalog'
    )
    const host = instances.find(
      (instance) => instance.options.name === 'nextHost'
    )
    self.postMessage({
      value: remote.message,
      runtime: producer && {
        names: instances.map((instance) => instance.options.name).sort(),
        sameShareScope:
          producer.shareScopeMap.default === remote.shareScope &&
          (!host || host.shareScopeMap.default === remote.shareScope),
        sharedVersions: Object.keys(remote.shareScope['shared-value']).sort(),
      },
    })
  } catch (error) {
    self.postMessage({
      error: (error as Error).stack ?? (error as Error).message,
    })
  }
})
