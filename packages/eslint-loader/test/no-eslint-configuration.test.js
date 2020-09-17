import pack from './utils/pack';

describe('no eslint configuration', () => {
  it('should emit warning when there is no eslint configuration', (done) => {
    const compiler = pack('good', { cwd: '/' });

    compiler.run((err, stats) => {
      expect(stats.hasWarnings()).toBe(true);

      const { warnings } = stats.compilation;
      expect(warnings[0].message).toMatch(/No ESLint configuration/i);
      done();
    });
  });
});
