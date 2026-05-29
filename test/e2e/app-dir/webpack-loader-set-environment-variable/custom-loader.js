module.exports = (_source) => {
  process.env.TEST_THIS_THING = 'def'
  return 'export default () => "The svg rendered"'
}
