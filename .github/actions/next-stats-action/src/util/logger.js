function logger(...args) {
  console.log(...args)
}

logger.json = (obj) => {
  logger('\n', JSON.stringify(obj, null, 2), '\n')
}

logger.error = (...args) => {
  console.error(...args)
}

logger.warn = (...args) => {
  console.warn(...args)
}

module.exports = logger
