import { describe, it } from 'vitest';
import jscodeshift, { type API } from 'jscodeshift';
import transform from '../src/index.js';
import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const buildApi = (parser: string | undefined): API => ({
  j: parser ? jscodeshift.withParser(parser) : jscodeshift,
  jscodeshift: parser ? jscodeshift.withParser(parser) : jscodeshift,
  stats: () => {
    console.error(
      'The stats function was called, which is not supported on purpose',
    );
  },
  report: () => {
    console.error(
      'The report function was called, which is not supported on purpose',
    );
  },
});

describe('async-export-force-static', () => {
  it('test #1', async () => {
    const INPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture1.input.ts'), 'utf-8');
    const OUTPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture1.output.ts'), 'utf-8');

    const actualOutput = transform({
        path: 'index.js',
        source: INPUT,
      },
      buildApi('tsx'), {}
    );

    assert.deepEqual(
      actualOutput?.replace(/W/gm, ''),
      OUTPUT.replace(/W/gm, ''),
    );
  });

  it('test #2', async () => {
    const INPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture2.input.ts'), 'utf-8');
    const OUTPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture2.output.ts'), 'utf-8');

    const actualOutput = transform({
        path: 'index.js',
        source: INPUT,
      },
      buildApi('tsx'), {}
    );

    assert.deepEqual(
      actualOutput?.replace(/W/gm, ''),
      OUTPUT.replace(/W/gm, ''),
    );
  });

  it('test #3', async () => {
    const INPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture3.input.ts'), 'utf-8');
    const OUTPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture3.output.ts'), 'utf-8');

    const actualOutput = transform({
        path: 'index.js',
        source: INPUT,
      },
      buildApi('tsx'), {}
    );

    assert.deepEqual(
      actualOutput?.replace(/W/gm, ''),
      OUTPUT.replace(/W/gm, ''),
    );
  });

  it('test #4', async () => {
    const INPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture4.input.ts'), 'utf-8');
    const OUTPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture4.output.ts'), 'utf-8');

    const actualOutput = transform({
        path: 'index.js',
        source: INPUT,
      },
      buildApi('tsx'), {}
    );

    assert.deepEqual(
      actualOutput?.replace(/W/gm, ''),
      OUTPUT.replace(/W/gm, ''),
    );
  });

  it('test #5', async () => {
    const INPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture5.input.ts'), 'utf-8');
    const OUTPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture5.output.ts'), 'utf-8');

    const actualOutput = transform({
        path: 'index.js',
        source: INPUT,
      },
      buildApi('tsx'), {}
    );

    assert.deepEqual(
      actualOutput?.replace(/W/gm, ''),
      OUTPUT.replace(/W/gm, ''),
    );
  });

  it('test #6', async () => {
    const INPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture6.input.ts'), 'utf-8');
    const OUTPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture6.output.ts'), 'utf-8');

    const actualOutput = transform({
        path: 'index.js',
        source: INPUT,
      },
      buildApi('tsx'), {}
    );

    assert.deepEqual(
      actualOutput?.replace(/W/gm, ''),
      OUTPUT.replace(/W/gm, ''),
    );
  });

  it('test #7', async () => {
    const INPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture7.input.ts'), 'utf-8');
    const OUTPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture7.output.ts'), 'utf-8');

    const actualOutput = transform({
        path: 'index.js',
        source: INPUT,
      },
      buildApi('tsx'), {}
    );

    assert.deepEqual(
      actualOutput?.replace(/W/gm, ''),
      OUTPUT.replace(/W/gm, ''),
    );
  });

  it('test #8', async () => {
    const INPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture8.input.ts'), 'utf-8');
    const OUTPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture8.output.ts'), 'utf-8');

    const actualOutput = transform({
        path: 'index.js',
        source: INPUT,
      },
      buildApi('tsx'), {}
    );

    assert.deepEqual(
      actualOutput?.replace(/W/gm, ''),
      OUTPUT.replace(/W/gm, ''),
    );
  });

  it('test #9', async () => {
    const INPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture9.input.ts'), 'utf-8');
    const OUTPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture9.output.ts'), 'utf-8');

    const actualOutput = transform({
        path: 'index.js',
        source: INPUT,
      },
      buildApi('tsx'), {}
    );

    assert.deepEqual(
      actualOutput?.replace(/W/gm, ''),
      OUTPUT.replace(/W/gm, ''),
    );
  });

  it('test #10', async () => {
    const INPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture10.input.ts'), 'utf-8');
    const OUTPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture10.output.ts'), 'utf-8');

    const actualOutput = transform({
        path: 'index.js',
        source: INPUT,
      },
      buildApi('tsx'), {}
    );

    assert.deepEqual(
      actualOutput?.replace(/W/gm, ''),
      OUTPUT.replace(/W/gm, ''),
    );
  });

  it('test #11', async () => {
    const INPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture11.input.ts'), 'utf-8');
    const OUTPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture11.output.ts'), 'utf-8');

    const actualOutput = transform({
        path: 'index.js',
        source: INPUT,
      },
      buildApi('tsx'), {}
    );

    assert.deepEqual(
      actualOutput?.replace(/W/gm, ''),
      OUTPUT.replace(/W/gm, ''),
    );
  });

  it('test #12', async () => {
    const INPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture12.input.ts'), 'utf-8');
    const OUTPUT = await readFile(join(__dirname, '..', '__testfixtures__/fixture12.output.ts'), 'utf-8');

    const actualOutput = transform({
        path: 'index.js',
        source: INPUT,
      },
      buildApi('tsx'), {}
    );

    assert.deepEqual(
      actualOutput?.replace(/W/gm, ''),
      OUTPUT.replace(/W/gm, ''),
    );
  });
});