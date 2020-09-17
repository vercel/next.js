import Linter from '../src/Linter';

describe('Linter', () => {
  let linter;

  beforeAll(() => {
    const loaderContext = {
      resourcePath: 'test',
    };

    const options = {
      eslintPath: 'eslint',
      ignore: false,
      formatter: jest.fn(),
    };

    linter = new Linter(loaderContext, options);
  });

  it('should parse undefined results without error', () => {
    expect(linter.parseResults({})).toBeUndefined();
  });

  it('should parse results correctly', () => {
    const res = {
      results: [{ filePath: '' }],
    };

    expect(linter.parseResults(res)).toEqual([{ filePath: 'test' }]);
  });
});
