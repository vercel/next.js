import pack from './utils/pack';

describe('error', () => {
  it('should return error if file is bad', (done) => {
    const compiler = pack('error');

    compiler.run((err, stats) => {
      expect(stats.hasErrors()).toBe(true);
      done();
    });
  });
});
