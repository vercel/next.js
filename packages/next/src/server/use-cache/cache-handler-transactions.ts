interface CacheHandlerTransaction {
  promise: Promise<void>
  resolve: () => void
}

// This map of transactions is safe to share across multiple requests, because
// cache entries with the same key are inherently sharable across requests.
const cacheHandlerTransactions = new Map<string, CacheHandlerTransaction>()

export async function startCacheHandlerTransaction(
  cacheKey: string
): Promise<() => void> {
  const previousTransaction = cacheHandlerTransactions.get(cacheKey)

  if (previousTransaction) {
    await previousTransaction.promise
  }

  let resolvePromise: () => void

  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })

  const transaction: CacheHandlerTransaction = {
    promise,
    resolve: () => {
      cacheHandlerTransactions.delete(cacheKey)
      resolvePromise()
    },
  }

  cacheHandlerTransactions.set(cacheKey, transaction)

  return transaction.resolve
}
