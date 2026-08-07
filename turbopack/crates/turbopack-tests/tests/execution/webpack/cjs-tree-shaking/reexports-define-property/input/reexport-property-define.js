Object.defineProperty(exports, 'property1', {
  value: require('./module').abc,
})
Object.defineProperty(module.exports, 'property2', {
  value: require('./module').abc,
})
Object.defineProperty(this, 'property3', {
  value: require('./module').abc,
})
