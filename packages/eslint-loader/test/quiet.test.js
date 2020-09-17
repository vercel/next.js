import pack from './utils/pack';

describe('quiet', () => {
  it('should not emit warnings if quiet is set', (done) => {
    const compiler = pack('warn', { quiet: true });

    compiler.run((err, stats) => {
      expect(stats.hasWarnings()).toBe(false);
      expect(stats.hasErrors()).toBe(false);
      done();
    });
  });
});
