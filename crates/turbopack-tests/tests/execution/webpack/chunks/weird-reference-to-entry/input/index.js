it("should handle reference to entry chunk correctly", function (done) {
  import(/* webpackChunkName: "main" */ "./module-a")
    .then(function (result) {
      expect(result.default).toBe("ok");
      done();
    })
    .catch(function (e) {
      done(e);
    });
});
