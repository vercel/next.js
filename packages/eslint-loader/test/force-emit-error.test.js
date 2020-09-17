import pack from './utils/pack';

describe('force emit error', () => {
  it('should force to emit error', (done) => {
    const compiler = pack('warn', { emitError: true });

    compiler.run((err, stats) => {
      expect(stats.hasWarnings()).toBe(false);
      expect(stats.hasErrors()).toBe(true);
      done();
    });
  });
});
