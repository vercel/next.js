it('should compile and run fine', function (done) {
  Promise.all([import('./a1'), import('./b1'), import('./c1')]).then(
    function () {
      done()
    }
  )
})
