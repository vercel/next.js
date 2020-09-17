import pack from './utils/pack';

describe('formatter eslint', () => {
  it('should use eslint formatter', (done) => {
    const compiler = pack('error');

    compiler.run((err, stats) => {
      expect(stats.compilation.errors[0].message).toBeTruthy();
      done();
    });
  });
});
