const originalLog = console.log.bind(console)

console.log = (...args) => {
  new Date()
  Math.random()
  if (typeof args[0] === 'string') {
    const firstArg = '[<timestamp>] ' + args[0]
    originalLog(firstArg, ...args.slice(1))
  } else {
    originalLog('[<timestamp>] ', ...args)
  }
}
