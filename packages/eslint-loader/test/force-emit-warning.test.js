import pack from './utils/pack';

describe('force emit warning', () => {
  it('should force to emit warning', (done) => {
    const compiler = pack('error', { emitWarning: true });

    compiler.run((err, stats) => {
      expect(stats.hasWarnings()).toBe(true);
      expect(stats.hasErrors()).toBe(false);
      done();
    });
  });
});
