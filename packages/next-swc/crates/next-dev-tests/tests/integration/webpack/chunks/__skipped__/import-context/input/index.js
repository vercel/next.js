function testCase(load, done) {
  load("two", 2, function () {
    var sync = true;
    load("one", 1, function () {
      expect(sync).toBe(false);
      load("three", 3, function () {
        var sync = true;
        load("two", 2, function () {
          expect(sync).toBe(true);
          done();
        });
        Promise.resolve()
          .then(function () {})
          .then(function () {})
          .then(function () {
            sync = false;
          });
      });
    });
    Promise.resolve().then(function () {
      sync = false;
    });
  });
}

it("should be able to use expressions in import", function (done) {
  function load(name, expected, callback) {
    import("./dir/" + name)
      .then(function (result) {
        expect(result).toEqual(
          nsObj({
            default: expected,
          })
        );
        callback();
      })
      .catch(function (err) {
        done(err);
      });
  }
  testCase(load, done);
});
