const f = () => 'ok'
f.x = function () {
  return this()
}
export { f }
