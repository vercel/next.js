import pack from './utils/pack';

describe('fail on error', () => {
  it('should emits errors', (done) => {
    const compiler = pack('error', { failOnError: true });

    compiler.run((err, stats) => {
      expect(stats.hasErrors()).toBe(true);
      done();
    });
  });

  it('should correctly indentifies a success', (done) => {
    const compiler = pack('good', { failOnError: true });

    compiler.run((err, stats) => {
      expect(stats.hasErrors()).toBe(false);
      done();
    });
  });

  it('should emits errors when cache enabled', (done) => {
    const compiler = pack('error', { failOnError: true, cache: true });

    compiler.run((err, stats) => {
      expect(stats.hasErrors()).toBe(true);
      done();
    });
  });
});
