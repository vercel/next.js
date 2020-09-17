import { join } from 'path';

export default (entry, loaderConf = {}, webpackConf = {}) => {
  const testDir = join(__dirname, '..');
  const fixturesDir = join(testDir, 'fixtures');

  return {
    entry: typeof entry === 'string' ? join(fixturesDir, `${entry}.js`) : entry,
    mode: 'development',
    output: {
      path: join(testDir, 'output'),
      filename: 'bundle.js',
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: [
            {
              loader: join(testDir, '../src/index'),
              options: {
                // this disables the use of .eslintignore, since it contains the fixtures
                // folder to skip it on the global linting, but here we want the opposite
                // (we only use .eslintignore on the test that checks this)
                ignore: false,
                ...loaderConf,
              },
            },
          ],
        },
      ],
    },
    ...webpackConf,
  };
};
