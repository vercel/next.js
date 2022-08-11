it('should also work in a chunk', function (done) {
  require.ensure([], function (require) {
    var contextRequire = require.context('.', false, /two/)
    expect(contextRequire('./two')).toBe(2)
    var tw = 'tw'
    expect(require('.' + '/' + tw + 'o')).toBe(2)
    done()
  })
})
