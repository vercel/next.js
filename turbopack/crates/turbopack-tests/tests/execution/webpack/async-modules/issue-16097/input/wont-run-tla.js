global.someNonExistentVariable && (await 'test')
const foo = global.otherSomeNonExistentVariable && (await 43)
export default 42
export { foo }
