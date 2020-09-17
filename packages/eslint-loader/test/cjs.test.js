import EslintLoader from '../src';
import CJSEslintLoader from '../src/cjs';

describe('cjs', () => {
  it('should exported plugin', () => {
    expect(CJSEslintLoader).toEqual(EslintLoader);
  });
});
