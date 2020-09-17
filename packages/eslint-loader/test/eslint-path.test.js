import { join } from 'path';

import pack from './utils/pack';

describe('eslint path', () => {
  it('should use another instance of eslint via eslintPath config', (done) => {
    const eslintPath = join(__dirname, 'mock/eslint');
    const compiler = pack('good', { eslintPath });

    compiler.run((err, stats) => {
      expect(stats.hasErrors()).toBe(true);
      expect(stats.compilation.errors[0].message).toContain('Fake error');
      done();
    });
  });
});
