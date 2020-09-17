import pack from './utils/pack';

describe('warning', () => {
  it('should emit warnings', (done) => {
    const compiler = pack('warn');

    compiler.run((err, stats) => {
      expect(stats.hasWarnings()).toBe(true);
      expect(stats.hasErrors()).toBe(false);
      done();
    });
  });
});
