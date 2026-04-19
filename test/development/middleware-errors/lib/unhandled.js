setTimeout(() => {
  throw new Error('This file asynchronously fails while loading')
}, 10)
