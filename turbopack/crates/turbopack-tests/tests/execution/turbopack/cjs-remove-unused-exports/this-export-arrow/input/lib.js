// The only CommonJS signal is `this` inside a top-level arrow, which keeps the
// module-scope `this` (`module.exports`).
const register = () => {
  this.fromArrow = 'arrow-value'
}
register()
