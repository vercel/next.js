import pack from './utils/pack';

describe('parameters', () => {
  it('should supports query strings parameters', (done) => {
    const compiler = pack('good', { rules: { semi: 0 } });

    compiler.run((err, stats) => {
      expect(stats.hasWarnings()).toBe(false);
      expect(stats.hasErrors()).toBe(false);
      done();
    });
  });
});
