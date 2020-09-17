import { basename, join } from 'path';

import { readFileSync } from 'fs-extra';
import { CLIEngine } from 'eslint';
import webpack from 'webpack';

import conf from './utils/conf';

describe('formatter multiple entries', () => {
  it('should be configured to write multiple eslint result files', (done) => {
    const formatter = CLIEngine.getFormatter('checkstyle');
    const outputFilename = 'outputReport-[name].txt';
    const config = conf(
      [
        join(__dirname, 'fixtures/error-multi-two.js'),
        join(__dirname, 'fixtures/error-multi-one.js'),
        join(__dirname, 'fixtures/error-multi.js'),
      ],
      {
        formatter,
        outputReport: {
          filePath: outputFilename,
          formatter,
        },
      }
    );

    const compiler = webpack(config);

    compiler.run((err, stats) => {
      stats.compilation.errors.forEach((e) => {
        const name = basename(e.module.resource, '.js');
        const filename = join(config.output.path, `outputReport-${name}.txt`);
        const contents = readFileSync(filename, 'utf8');
        expect(e.error.message).toBe(contents);
      });

      done();
    });
  });
});
