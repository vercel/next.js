it('should be able to use expressions in import (directory)', function (done) {
  function load(name, expected, callback) {
    import('./dir/' + name + '/file.js')
      .then(function (result) {
        expect(result).toEqual(
          nsObj({
            default: expected,
          })
        )
        callback()
      })
      .catch(function (err) {
        done(err)
      })
  }
  if (Math.random() < 0) require('./dir/three/file')
  load('one', 1, function () {
    load('two', 2, function () {
      load('three', 3, function () {
        load('two', 2, function () {
          done()
        })
      })
    })
  })
})
