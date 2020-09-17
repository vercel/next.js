import { join } from 'path';

import { copySync, removeSync } from 'fs-extra';
import chokidar from 'chokidar';

import pack from './utils/pack';

describe('autofix stop', () => {
  const entry = join(__dirname, 'fixtures/nonfixable-clone.js');

  let changed = false;
  let watcher;

  beforeAll(() => {
    copySync(join(__dirname, 'fixtures/nonfixable.js'), entry);

    watcher = chokidar.watch(entry);
    watcher.on('change', () => {
      changed = true;
    });
  });

  afterAll(() => {
    watcher.close();
    removeSync(entry);
  });

  it('should not change file if there are no fixable errors/warnings', (done) => {
    const compiler = pack('nonfixable-clone', { fix: true });

    compiler.run(() => {
      expect(changed).toBe(false);
      done();
    });
  });
});
