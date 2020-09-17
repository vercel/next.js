import { join } from 'path';

import { copySync, removeSync } from 'fs-extra';

import pack from './utils/pack';

describe('autofix stop', () => {
  const entry = join(__dirname, 'fixtures/fixable-clone.js');

  beforeAll(() => {
    copySync(join(__dirname, 'fixtures/fixable.js'), entry);
  });

  afterAll(() => {
    removeSync(entry);
  });

  it('should not throw error if file ok after auto-fixing', (done) => {
    const compiler = pack('fixable-clone', { fix: true });

    compiler.run((err, stats) => {
      expect(stats.hasWarnings()).toBe(false);
      expect(stats.hasErrors()).toBe(false);
      done();
    });
  });
});
