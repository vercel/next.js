import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

it('formats DOM, Locators and missing-element Errors with defaults and ordered effects', async () => {
  const retained = process.env.NEXT_TESTING_DOM_UTILITIES_EVIDENCE
  const temporary =
    retained ?? (await mkdtemp(join(tmpdir(), 'next-dom-utilities-')))
  let complete = false
  try {
    const evidence = retained ?? join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [join(__dirname, 'verify.mjs'), join(__dirname, '../../../..'), evidence],
      { timeout: 750000, maxBuffer: 1024 * 1024 }
    )
    const result = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(result.profiles).toBe(2)
    expect(result.cases).toBe(26)
    expect(result.basicDOMBehaviorAssertionsPassed).toBe(true)
    expect(result.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(`DOM utility evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 780000)

it('publishes strict DOM utility signatures through both public Browser modules', async () => {
  const retained = process.env.NEXT_TESTING_DOM_UTILITIES_TYPES_EVIDENCE
  const temporary =
    retained ?? (await mkdtemp(join(tmpdir(), 'next-dom-utilities-types-')))
  let complete = false
  try {
    const evidence = retained ?? join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'verify-types.mjs'),
        join(__dirname, '../../../..'),
        evidence,
      ],
      { timeout: 140000, maxBuffer: 1024 * 1024 }
    )
    const result = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(result.profiles).toBe(2)
    expect(result.actualShippedAmbientEntry).toBe(true)
    expect(result.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(`DOM utility type evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 150000)

it('publishes strict missing-element Error signatures through both Browser modules', async () => {
  const retained = process.env.NEXT_TESTING_DOM_ELEMENT_ERRORS_TYPES_EVIDENCE
  const temporary =
    retained ??
    (await mkdtemp(join(tmpdir(), 'next-dom-element-errors-types-')))
  let complete = false
  try {
    const evidence = retained ?? join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'verify-types.mjs'),
        join(__dirname, '../../../..'),
        evidence,
        join(__dirname, '../../../..'),
        'element-errors',
      ],
      { timeout: 140000, maxBuffer: 1024 * 1024 }
    )
    const result = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(result.profiles).toBe(2)
    expect(result.runs[0].negativeAssertionsConsumed).toBe(5)
    expect(result.runs[1].negativeAssertionsConsumed).toBe(5)
    expect(result.actualShippedAmbientEntry).toBe(true)
    expect(result.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(
      `DOM element Error type evidence retained at ${temporary}`,
      {
        cause: error,
      }
    )
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 150000)

it('uses live locator configuration for error formats and TestId targets', async () => {
  const retained = process.env.NEXT_TESTING_DOM_ERROR_FORMAT_STATE_EVIDENCE
  const temporary =
    retained ?? (await mkdtemp(join(tmpdir(), 'next-dom-error-format-state-')))
  let complete = false
  try {
    const evidence = retained ?? join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'verify-locator-config.mjs'),
        join(__dirname, '../../../..'),
        evidence,
      ],
      { timeout: 270000, maxBuffer: 1024 * 1024 }
    )
    const result = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(result.profiles).toBe(2)
    expect(result.cases).toBe(36)
    expect(result.locatorConfigurationAssertionsPassed).toBe(true)
    expect(result.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(`DOM errorFormat state evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 300000)

it('publishes writable required errorFormat types through both Browser modules', async () => {
  const retained = process.env.NEXT_TESTING_DOM_ERROR_FORMAT_TYPES_EVIDENCE
  const temporary =
    retained ?? (await mkdtemp(join(tmpdir(), 'next-dom-error-format-types-')))
  let complete = false
  try {
    const evidence = retained ?? join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'verify-error-format-types.mjs'),
        'source',
        join(__dirname, '../../../..'),
        evidence,
      ],
      { timeout: 140000, maxBuffer: 1024 * 1024 }
    )
    const result = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(result.qualification).toBe('source')
    expect(result.profiles).toBe(2)
    expect(result.requiredWritableThreeLiteralUnion).toBe(true)
    expect(result.negativeAssertionsConsumed).toBe(6)
    expect(result.unsuppressedNegativeDiagnosticsExact).toBe(true)
    expect(result.bothAliasesResolveSameActualNextServerSymbol).toBe(true)
    expect(result.actualShippedAmbientEntry).toBe(true)
    expect(result.installedZeroVitestQualified).toBe(false)
    expect(result.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(`DOM errorFormat type evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 150000)
it('preserves native optional-container Errors and formatting effects', async () => {
  const retained = process.env.NEXT_TESTING_DOM_OPTIONAL_CONTAINERS_EVIDENCE
  const temporary =
    retained ?? (await mkdtemp(join(tmpdir(), 'next-dom-optional-containers-')))
  let complete = false
  try {
    const evidence = retained ?? join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'verify-optional-container.mjs'),
        join(__dirname, '../../../..'),
        evidence,
      ],
      { timeout: 270000, maxBuffer: 1024 * 1024 }
    )
    const result = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(result.profiles).toBe(2)
    expect(result.projects).toBe(6)
    expect(result.cases).toBe(42)
    expect(result.optionalContainerBehaviorAssertionsPassed).toBe(true)
    expect(result.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(
      `DOM optional-container evidence retained at ${temporary}`,
      {
        cause: error,
      }
    )
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 300000)

describe.each(['development', 'production'] as const)(
  'locator error format configuration in %s',
  (mode) => {
    const {
      normalizeTestConfig,
    } = require('next/dist/experimental/testing/config')
    const browser = {
      enabled: true,
      headless: true,
      instances: [{ browser: 'chromium' }],
    }
    const format = (value: unknown) => ({ locators: { errorFormat: value } })
    const normalizedFormat = (configuration: unknown) => {
      const result = normalizeTestConfig(configuration)
      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].profile.mode).toBe(mode)
      return result.projects[0].browserLocatorErrorFormat
    }
    it.each([
      ['omitted', {}, 'all'],
      ['undefined', format(undefined), 'all'],
      ['null', format(null), 'all'],
      ['aria', format('aria'), 'aria'],
      ['html', format('html'), 'html'],
      ['all', format('all'), 'all'],
      ['false', format(false), false],
      ['zero', format(0), 0],
      ['empty', format(''), ''],
      ['unknown', format('future-format'), 'future-format'],
      ['array', format([]), []],
      ['object', format({}), {}],
    ])('normalizes the %s locator option', (_label, settings, expected) => {
      expect(
        normalizedFormat({
          test: {
            projects: [
              {
                extends: false,
                test: {
                  name: 'format-raw',
                  mode,
                  environment: 'browser',
                  browser: { ...browser, ...(settings as object) },
                },
              },
            ],
          },
        })
      ).toEqual(expected)
    })
    it.each([
      ['default', {}, {}, 'aria'],
      ['true', { extends: true }, {}, 'aria'],
      ['independent', { extends: false }, { ...browser }, 'all'],
      ['empty', { extends: true }, { locators: {} }, 'aria'],
      ['null', { extends: true }, format(null), 'aria'],
      ['undefined', { extends: true }, format(undefined), 'aria'],
      ['locators-null', { extends: true }, { locators: null }, 'aria'],
      [
        'locators-undefined',
        { extends: true },
        { locators: undefined },
        'aria',
      ],
      ['html', { extends: true }, format('html'), 'html'],
    ])(
      'inherits the %s project locator option',
      (_label, inheritance, settings, expected) => {
        expect(
          normalizedFormat({
            test: {
              mode,
              environment: 'browser',
              browser: {
                enabled: true,
                headless: true,
                instances: [],
                locators: { errorFormat: 'aria' },
              },
              projects: [
                {
                  ...(inheritance as object),
                  test: {
                    name: 'format-project',
                    mode,
                    environment: 'browser',
                    browser: {
                      instances: [{ browser: 'chromium' }],
                      ...(settings as object),
                    },
                  },
                },
              ],
            },
          })
        ).toEqual(expected)
      }
    )
    it.each([
      ['omitted', {}, 'aria'],
      ['locators-undefined', { locators: undefined }, 'aria'],
      ['locators-null', { locators: null }, 'aria'],
      ['locators-empty', { locators: {} }, 'aria'],
      ['undefined', format(undefined), 'aria'],
      ['null', format(null), 'aria'],
      ['aria', format('aria'), 'aria'],
      ['html', format('html'), 'html'],
      ['all', format('all'), 'all'],
      ['false', format(false), false],
      ['zero', format(0), 0],
      ['empty', format(''), ''],
      ['unknown', format('future-format'), 'future-format'],
      ['array', format([]), []],
      ['object', format({}), {}],
    ])(
      'resolves the %s Browser instance locator option',
      (_label, settings, expected) => {
        expect(
          normalizedFormat({
            test: {
              projects: [
                {
                  extends: false,
                  test: {
                    name: 'format-instance',
                    mode,
                    environment: 'browser',
                    browser: {
                      ...browser,
                      locators: { errorFormat: 'aria' },
                      instances: [
                        { browser: 'chromium', ...(settings as object) },
                      ],
                    },
                  },
                },
              ],
            },
          })
        ).toEqual(expected)
      }
    )
  }
)

describe.each(['development', 'production'] as const)(
  'TestId attribute configuration in %s',
  (mode) => {
    const {
      normalizeTestConfig,
    } = require('next/dist/experimental/testing/config')
    const locators = (testIdAttribute: unknown) => ({
      locators: { testIdAttribute },
    })
    it.each([
      ['omitted-default', {}, {}, {}, undefined],
      ['root-qa', locators('data-qa'), {}, {}, 'data-qa'],
      [
        'child-string',
        locators('data-qa'),
        locators('data-child'),
        {},
        'data-child',
      ],
      [
        'instance-string',
        locators('data-qa'),
        locators('data-child'),
        locators('data-instance'),
        'data-instance',
      ],
      [
        'child-undefined',
        locators('data-qa'),
        locators(undefined),
        {},
        'data-qa',
      ],
      ['child-null', locators('data-qa'), locators(null), {}, 'data-qa'],
      [
        'instance-undefined',
        locators('data-qa'),
        locators('data-child'),
        locators(undefined),
        'data-child',
      ],
      [
        'instance-null',
        locators('data-qa'),
        locators('data-child'),
        locators(null),
        'data-child',
      ],
    ])(
      'resolves the %s TestId option',
      (_label, root, child, instance, expected) => {
        const result = normalizeTestConfig({
          test: {
            mode,
            environment: 'browser',
            browser: {
              enabled: true,
              headless: true,
              instances: [],
              ...(root as object),
            },
            projects: [
              {
                extends: true,
                test: {
                  name: 'testid-project',
                  mode,
                  environment: 'browser',
                  browser: {
                    ...(child as object),
                    instances: [
                      { browser: 'chromium', ...(instance as object) },
                    ],
                  },
                },
              },
            ],
          },
        })
        expect(result.projects).toHaveLength(1)
        expect(result.projects[0].profile.mode).toBe(mode)
        expect(result.projects[0].browserLocatorTestIdAttribute).toBe(expected)
      }
    )
  }
)
