import { join } from 'path';
import fs from 'fs';

import { readdirSync, removeSync } from 'fs-extra';
import webpack from 'webpack';

const defaultCacheDir = join(__dirname, '../node_modules/.cache/eslint-loader');
const cacheDir = join(__dirname, 'output/cache/cachefiles');
const outputDir = join(__dirname, 'output/cache');
const eslintLoader = join(__dirname, '../src/index');
const globalConfig = {
  entry: join(__dirname, 'fixtures/cache.js'),
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: eslintLoader,
      },
    ],
  },
};

function createTestDirectory(dir) {
  const directory = join(dir, 'cache');

  removeSync(directory);
  fs.mkdirSync(directory, { recursive: true });

  return directory;
}

describe('cache', () => {
  let directory;
  let cache;

  beforeEach(() => {
    directory = createTestDirectory(outputDir);
    cache = createTestDirectory(cacheDir);
    removeSync(defaultCacheDir);
  });

  afterEach(() => {
    removeSync(cache);
    removeSync(directory);
  });

  it('should output files to cache directory', (done) => {
    const compiler = webpack({
      ...globalConfig,
      output: {
        path: directory,
      },
      module: {
        rules: [
          {
            test: /\.js$/,
            exclude: /node_modules/,
            use: `${eslintLoader}?cache=${cache}`,
          },
        ],
      },
    });
    compiler.run(() => {
      const files = readdirSync(cache);
      expect(files.length).toBeGreaterThan(0);
      done();
    });
  });

  it('should output files to standard cache dir if set to true in query', (done) => {
    const compiler = webpack({
      ...globalConfig,
      output: {
        path: directory,
      },
      module: {
        rules: [
          {
            test: /\.jsx?/,
            exclude: /node_modules/,
            use: `${eslintLoader}?cache=true`,
          },
        ],
      },
    });
    compiler.run(() => {
      const files = readdirSync(defaultCacheDir).filter((file) =>
        /\b[0-9a-f]{5,40}\.json\.gz\b/.test(file)
      );
      expect(files.length).toBeGreaterThan(0);
      done();
    });
  });

  it('should read from cache directory if cached file exists', (done) => {
    const compiler = webpack({
      ...globalConfig,
      output: {
        path: directory,
      },
      module: {
        rules: [
          {
            test: /\.jsx?/,
            exclude: /node_modules/,
            use: `${eslintLoader}?cache=${cache}`,
          },
        ],
      },
    });
    compiler.run(() => {
      const files = readdirSync(cache);
      expect(files.length).toBe(3);
      done();
    });
  });

  it('should generate a new file if the identifier changes', (done) => {
    const configs = [
      {
        ...globalConfig,
        output: {
          path: directory,
        },
        module: {
          rules: [
            {
              test: /\.jsx?/,
              exclude: /node_modules/,
              use: `${eslintLoader}?cache=${cache}&cacheIdentifier=a`,
            },
          ],
        },
      },
      {
        ...globalConfig,
        output: {
          path: directory,
        },
        module: {
          rules: [
            {
              test: /\.jsx?/,
              exclude: /node_modules/,
              use: `${eslintLoader}?cache=${cache}&cacheIdentifier=b`,
            },
          ],
        },
      },
    ];

    let counter = configs.length;

    configs.forEach((config) => {
      const compiler = webpack(config);
      compiler.run(() => {
        counter -= 1;

        if (!counter) {
          const files = readdirSync(cache);
          expect(files.length).toBe(6);
          done();
        }
      });
    });
  });
});
