/* globals it */
it('should handle duplicate chunks', function (done) {
  var firstOne = false,
    secondOne = false
  require.ensure([], function (require) {
    require('./acircular')
    require('./duplicate')
    require('./duplicate2')
    firstOne = true
    if (secondOne) done()
  })
  require.ensure([], function (require) {
    require('./acircular2')
    require('./duplicate')
    require('./duplicate2')
    secondOne = true
    if (firstOne) done()
  })
})

it('should not load a chunk which is included in a already loaded one', function (done) {
  var asyncFlag = false
  require.ensure(['./empty?x', './empty?y', './empty?z'], function (require) {
    try {
      expect(asyncFlag).toBe(true)
      loadChunk()
    } catch (e) {
      done(e)
    }
  })
  Promise.resolve()
    .then(function () {})
    .then(function () {})
    .then(function () {
      asyncFlag = true
    })
  function loadChunk() {
    var sync = true
    require.ensure(['./empty?x', './empty?y'], function (require) {
      try {
        expect(sync).toBe(true)
        done()
      } catch (e) {
        done(e)
      }
    })
    Promise.resolve()
      .then(function () {})
      .then(function () {})
      .then(function () {
        sync = false
      })
  }
})
