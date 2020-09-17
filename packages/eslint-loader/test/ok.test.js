import pack from './utils/pack';

describe('ok', () => {
  it("should don't throw error if file is ok", (done) => {
    const compiler = pack('good');

    compiler.run((err, stats) => {
      expect(stats.hasWarnings()).toBe(false);
      expect(stats.hasErrors()).toBe(false);
      done();
    });
  });
});
