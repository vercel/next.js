import { join } from 'path';

import { readFileSync } from 'fs-extra';
import { CLIEngine } from 'eslint';
import webpack from 'webpack';

import conf from './utils/conf';

describe('formatter write', () => {
  it('should configured to write eslint results to a file (relative path)', (done) => {
    const outputFilename = 'outputReport-relative.txt';
    const loaderOptions = {
      formatter: CLIEngine.getFormatter('checkstyle'),
      outputReport: {
        filePath: outputFilename,
      },
    };

    const config = conf('error', loaderOptions);
    const compiler = webpack(config);

    compiler.run((err, stats) => {
      const filePath = join(config.output.path, outputFilename);
      const contents = readFileSync(filePath, 'utf8');

      expect(stats.compilation.errors[0].error.message).toBe(contents);
      done();
    });
  });

  it('should configured to write eslint results to a file (absolute path)', (done) => {
    const outputFilename = 'outputReport-absolute.txt';
    const outputFilepath = join(__dirname, 'output', outputFilename);
    const loaderOptions = {
      formatter: CLIEngine.getFormatter('checkstyle'),
      outputReport: {
        filePath: outputFilepath,
      },
    };

    const config = conf('error', loaderOptions);
    const compiler = webpack(config);

    compiler.run((err, stats) => {
      const contents = readFileSync(outputFilepath, 'utf8');

      expect(stats.compilation.errors[0].error.message).toBe(contents);
      done();
    });
  });
});
