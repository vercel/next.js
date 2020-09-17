import pack from './utils/pack';

describe('eslintignore', () => {
  it('should ignores files present in .eslintignore', (done) => {
    const compiler = pack('ignore', { ignore: true });

    compiler.run((err, stats) => {
      expect(stats.hasWarnings()).toBe(false);
      done();
    });
  });
});
