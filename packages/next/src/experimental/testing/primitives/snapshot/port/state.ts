/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { OptionsReceived as PrettyFormatOptions } from '../../pretty-format/index'
import type { ParsedStack } from '../../utils/index'
import type {
  ProcessDomainSnapshotOptions,
  SnapshotData,
  SnapshotEnvironment,
  SnapshotMatchOptions,
  SnapshotResult,
  SnapshotStateOptions,
  SnapshotUpdateState,
} from '../types'
import type { InlineSnapshot } from './inlineSnapshot'
import type { RawSnapshot, RawSnapshotInfo } from './rawSnapshot'
import { parseErrorStacktrace } from '../../utils/source-map'
import { saveInlineSnapshots } from './inlineSnapshot'
import { saveRawSnapshots } from './rawSnapshot'
import {
  addExtraLineBreaks,
  CounterMap,
  DefaultMap,
  evaluateSnapshotFile,
  keyToTestName,
  normalizeNewlines,
  removeExtraLineBreaks,
  saveSnapshotFile,
  serialize,
  testNameToKey,
} from './utils'

interface SnapshotReturnOptions {
  actual: string
  count: number
  expected?: string
  key: string
  pass: boolean
}

interface SaveStatus {
  deleted: boolean
  saved: boolean
}

type ParsedStackPosition = Pick<ParsedStack, 'file' | 'line' | 'column'>

export interface ExpectedSnapshot {
  key: string
  count: number
  data?: string
  markAsChecked: () => void
}

function isSameStackPosition(x: ParsedStackPosition, y: ParsedStackPosition) {
  return x.file === y.file && x.column === y.column && x.line === y.line
}

export default class SnapshotState {
  private _counters = new CounterMap<string>()
  private _dirty: boolean
  private _updateSnapshot: SnapshotUpdateState
  private _snapshotData: SnapshotData
  private _initialData: SnapshotData
  private _inlineSnapshots: Array<InlineSnapshot>
  private _inlineSnapshotStacks: Array<
    ParsedStack & { testId: string; snapshot: string }
  >
  private _testIdToKeys = new DefaultMap<string, string[]>(() => [])
  private _rawSnapshots: Array<RawSnapshot>
  private _rawSnapshotFiles = new Set<string>()
  private _uncheckedKeys: Set<string>
  private _snapshotFormat: PrettyFormatOptions
  private _environment: SnapshotEnvironment
  private _fileExists: boolean
  expand: boolean

  // getter/setter for jest-image-snapshot compat
  // https://github.com/vitest-dev/vitest/issues/7322
  private _added = new CounterMap<string>()
  private _matched = new CounterMap<string>()
  private _unmatched = new CounterMap<string>()
  private _updated = new CounterMap<string>()
  get added(): CounterMap<string> {
    return this._added
  }
  set added(value: number) {
    this._added._total = value
  }
  get matched(): CounterMap<string> {
    return this._matched
  }
  set matched(value: number) {
    this._matched._total = value
  }
  get unmatched(): CounterMap<string> {
    return this._unmatched
  }
  set unmatched(value: number) {
    this._unmatched._total = value
  }
  get updated(): CounterMap<string> {
    return this._updated
  }
  set updated(value: number) {
    this._updated._total = value
  }

  private constructor(
    public testFilePath: string,
    public snapshotPath: string,
    fileData: SnapshotData | null,
    options: SnapshotStateOptions
  ) {
    const data = fileData ?? Object.create(null)
    this._fileExists = fileData != null // TODO: update on watch?
    const update = options.updateSnapshot
    const dirty = (update === 'all' || update === 'new') && fileData != null
    this._initialData = { ...data }
    this._snapshotData = { ...data }
    this._dirty = dirty
    this._inlineSnapshots = []
    this._inlineSnapshotStacks = []
    this._rawSnapshots = []
    this._uncheckedKeys = new Set(Object.keys(this._snapshotData))
    this.expand = options.expand || false
    this._updateSnapshot = options.updateSnapshot
    this._snapshotFormat = {
      printBasicPrototype: false,
      escapeString: false,
      // more generous safety cap 128MB (same as Node's util.inspect)
      // instead of tighter pretty-format default 1MB
      // since users can purposely save large snapshot to a dedicated file.
      maxOutputLength: 2 ** 27,
      ...options.snapshotFormat,
    }
    this._environment = options.snapshotEnvironment
  }

  static async create(
    testFilePath: string,
    options: SnapshotStateOptions
  ): Promise<SnapshotState> {
    const environment = options.snapshotEnvironment
    const snapshotPath = await environment.resolvePath(testFilePath)
    let fileData: SnapshotData | null
    if (environment.readSnapshotFileData) {
      fileData = await environment.readSnapshotFileData(snapshotPath)
    } else {
      const content = await environment.readSnapshotFile(snapshotPath)
      fileData =
        content != null ? evaluateSnapshotFile(snapshotPath, content) : null
    }
    return new SnapshotState(testFilePath, snapshotPath, fileData, options)
  }

  get snapshotUpdateState(): SnapshotUpdateState {
    return this._updateSnapshot
  }

  get environment(): SnapshotEnvironment {
    return this._environment
  }

  markSnapshotsAsCheckedForTest(testName: string): void {
    this._uncheckedKeys.forEach((uncheckedKey) => {
      // skip snapshots with following keys
      //   testName n
      //   testName > xxx n (this is for toMatchSnapshot("xxx") API)
      if (
        uncheckedKey.startsWith(testName) &&
        /^ \d+$|^ > /.test(uncheckedKey.slice(testName.length))
      ) {
        this._uncheckedKeys.delete(uncheckedKey)
      }
    })
  }

  clearTest(testId: string): void {
    // clear inline
    this._inlineSnapshots = this._inlineSnapshots.filter(
      (s) => s.testId !== testId
    )
    this._inlineSnapshotStacks = this._inlineSnapshotStacks.filter(
      (s) => s.testId !== testId
    )

    // clear file
    for (const key of this._testIdToKeys.get(testId)) {
      const name = keyToTestName(key)
      const count = this._counters.get(name)
      if (count > 0) {
        if (key in this._initialData) {
          this._snapshotData[key] = this._initialData[key]
        } else {
          delete this._snapshotData[key]
        }
        this._counters.set(name, count - 1)
      }
    }
    this._testIdToKeys.delete(testId)

    // clear stats
    this.added.delete(testId)
    this.updated.delete(testId)
    this.matched.delete(testId)
    this.unmatched.delete(testId)
  }

  protected _inferInlineSnapshotStack(
    stacks: ParsedStack[]
  ): ParsedStack | null {
    // if called inside resolves/rejects, stacktrace is different
    const promiseIndex = stacks.findIndex((i) =>
      i.method.match(/__VITEST_(RESOLVES|REJECTS)__/)
    )
    if (promiseIndex !== -1) {
      return stacks[promiseIndex + 3]
    }

    // support poll + inline snapshot
    const pollChainIndex = stacks.findIndex((i) =>
      i.method.match(/__VITEST_POLL_CHAIN__/)
    )
    if (pollChainIndex !== -1) {
      return stacks[pollChainIndex + 1]
    }

    // inline snapshot function can be named __INLINE_SNAPSHOT_OFFSET_<n>__
    // to specify a custom stack offset
    for (let i = 0; i < stacks.length; i++) {
      const match = stacks[i].method.match(/__INLINE_SNAPSHOT_OFFSET_(\d+)__/)
      if (match) {
        return stacks[i + Number(match[1])] ?? null
      }
    }

    // custom matcher registered via expect.extend() — the wrapper function
    // in jest-extend.ts is named __VITEST_EXTEND_ASSERTION__
    const customMatcherIndex = stacks.findIndex((i) =>
      i.method.includes('__VITEST_EXTEND_ASSERTION__')
    )
    if (customMatcherIndex !== -1) {
      return stacks[customMatcherIndex + 3] ?? null
    }

    // inline snapshot function is called __INLINE_SNAPSHOT__
    // in integrations/snapshot/chai.ts
    const stackIndex = stacks.findIndex((i) =>
      i.method.includes('__INLINE_SNAPSHOT__')
    )
    return stackIndex !== -1 ? stacks[stackIndex + 2] : null
  }

  private _addSnapshot(
    key: string,
    receivedSerialized: string,
    options: {
      rawSnapshot?: RawSnapshotInfo
      stack?: ParsedStack
      testId: string
      assertionName?: string
    }
  ): void {
    this._dirty = true
    if (options.stack) {
      this._inlineSnapshots.push({
        ...options.stack,
        snapshot: receivedSerialized,
        testId: options.testId,
        assertionName: options.assertionName,
      })
    } else if (options.rawSnapshot) {
      this._rawSnapshots.push({
        ...options.rawSnapshot,
        snapshot: receivedSerialized,
      })
    } else {
      this._snapshotData[key] = receivedSerialized
    }
  }

  private _resolveKey(
    testId: string,
    testName: string,
    key?: string
  ): { key: string; count: number } {
    this._counters.increment(testName)
    const count = this._counters.get(testName)
    if (!key) {
      key = testNameToKey(testName, count)
    }
    this._testIdToKeys.get(testId).push(key)
    return { key, count }
  }

  private _resolveInlineStack(options: {
    testId: string
    snapshot: string
    assertionName: string
    error: Error
  }): ParsedStack {
    const { testId, snapshot, assertionName, error } = options
    const stacks = parseErrorStacktrace(error, { ignoreStackEntries: [] })
    const _stack = this._inferInlineSnapshotStack(stacks)
    if (!_stack) {
      const message = stacks
        .map(
          (s) =>
            `  ${s.file}:${s.line}:${s.column}${s.method ? ` (${s.method})` : ''}`
        )
        .join('\n')
      throw new Error(
        `@vitest/snapshot: Couldn't infer stack frame for inline snapshot.\n${message}`
      )
    }
    const stack = this.environment.processStackTrace?.(_stack) || _stack
    // removing 1 column, because source map points to the wrong
    // location for js files, but `column-1` points to the same in both js/ts
    // https://github.com/vitejs/vite/issues/8657
    stack.column--

    // reject multiple inline snapshots at the same location if snapshot is different
    const snapshotsWithSameStack = this._inlineSnapshotStacks.filter((s) =>
      isSameStackPosition(s, stack)
    )
    if (snapshotsWithSameStack.length > 0) {
      // ensure only one snapshot will be written at the same location
      this._inlineSnapshots = this._inlineSnapshots.filter(
        (s) => !isSameStackPosition(s, stack)
      )

      const differentSnapshot = snapshotsWithSameStack.find(
        (s) => s.snapshot !== snapshot
      )
      if (differentSnapshot) {
        throw Object.assign(
          new Error(
            `${assertionName} with different snapshots cannot be called at the same location`
          ),
          {
            actual: snapshot,
            expected: differentSnapshot.snapshot,
          }
        )
      }
    }
    this._inlineSnapshotStacks.push({ ...stack, testId, snapshot })
    return stack
  }

  private _reconcile(opts: {
    testId: string
    key: string
    count: number
    pass: boolean
    hasSnapshot: boolean
    snapshotIsPersisted: boolean
    addValue: string
    actualDisplay: string
    expectedDisplay?: string
    stack?: ParsedStack
    rawSnapshot?: RawSnapshotInfo
    assertionName?: string
  }): SnapshotReturnOptions {
    // These are the conditions on when to write snapshots:
    //  * There's no snapshot file in a non-CI environment.
    //  * There is a snapshot file and we decided to update the snapshot.
    //  * There is a snapshot file, but it doesn't have this snapshot.
    // These are the conditions on when not to write snapshots:
    //  * The update flag is set to 'none'.
    //  * There's no snapshot file or a file without this snapshot on a CI environment.
    if (
      (opts.hasSnapshot && this._updateSnapshot === 'all') ||
      ((!opts.hasSnapshot || !opts.snapshotIsPersisted) &&
        (this._updateSnapshot === 'new' || this._updateSnapshot === 'all'))
    ) {
      if (this._updateSnapshot === 'all') {
        if (!opts.pass) {
          if (opts.hasSnapshot) {
            this.updated.increment(opts.testId)
          } else {
            this.added.increment(opts.testId)
          }
          this._addSnapshot(opts.key, opts.addValue, {
            stack: opts.stack,
            testId: opts.testId,
            rawSnapshot: opts.rawSnapshot,
            assertionName: opts.assertionName,
          })
        } else {
          this.matched.increment(opts.testId)
        }
      } else {
        this._addSnapshot(opts.key, opts.addValue, {
          stack: opts.stack,
          testId: opts.testId,
          rawSnapshot: opts.rawSnapshot,
          assertionName: opts.assertionName,
        })
        this.added.increment(opts.testId)
      }

      return {
        actual: '',
        count: opts.count,
        expected: '',
        key: opts.key,
        pass: true,
      }
    } else {
      if (!opts.pass) {
        this.unmatched.increment(opts.testId)
        return {
          actual: opts.actualDisplay,
          count: opts.count,
          expected: opts.expectedDisplay,
          key: opts.key,
          pass: false,
        }
      } else {
        this.matched.increment(opts.testId)
        return {
          actual: '',
          count: opts.count,
          expected: '',
          key: opts.key,
          pass: true,
        }
      }
    }
  }

  async save(): Promise<SaveStatus> {
    const hasExternalSnapshots = Object.keys(this._snapshotData).length
    const hasInlineSnapshots = this._inlineSnapshots.length
    const hasRawSnapshots = this._rawSnapshots.length
    const isEmpty =
      !hasExternalSnapshots && !hasInlineSnapshots && !hasRawSnapshots

    const status: SaveStatus = {
      deleted: false,
      saved: false,
    }

    if ((this._dirty || this._uncheckedKeys.size) && !isEmpty) {
      if (hasExternalSnapshots) {
        await saveSnapshotFile(
          this._environment,
          this._snapshotData,
          this.snapshotPath
        )
        this._fileExists = true
      }
      if (hasInlineSnapshots) {
        await saveInlineSnapshots(this._environment, this._inlineSnapshots)
      }
      if (hasRawSnapshots) {
        await saveRawSnapshots(this._environment, this._rawSnapshots)
      }

      status.saved = true
    } else if (!hasExternalSnapshots && this._fileExists) {
      if (this._updateSnapshot === 'all') {
        await this._environment.removeSnapshotFile(this.snapshotPath)
        this._fileExists = false
      }

      status.deleted = true
    }

    return status
  }

  getUncheckedCount(): number {
    return this._uncheckedKeys.size || 0
  }

  getUncheckedKeys(): Array<string> {
    return Array.from(this._uncheckedKeys)
  }

  removeUncheckedKeys(): void {
    if (this._updateSnapshot === 'all' && this._uncheckedKeys.size) {
      this._dirty = true
      this._uncheckedKeys.forEach((key) => delete this._snapshotData[key])
      this._uncheckedKeys.clear()
    }
  }

  probeExpectedSnapshot(
    options: Pick<
      SnapshotMatchOptions,
      'testName' | 'testId' | 'isInline' | 'inlineSnapshot'
    >
  ): ExpectedSnapshot {
    const count = this._counters.get(options.testName) + 1
    const key = testNameToKey(options.testName, count)
    return {
      key,
      count,
      data: options?.isInline
        ? options.inlineSnapshot
        : this._snapshotData[key],
      markAsChecked: () => {
        this._counters.increment(options.testName)
        this._testIdToKeys.get(options.testId).push(key)
        this._uncheckedKeys.delete(key)
      },
    }
  }

  match({
    testId,
    testName,
    received,
    key,
    inlineSnapshot,
    isInline,
    error,
    rawSnapshot,
    assertionName,
  }: SnapshotMatchOptions): SnapshotReturnOptions {
    const resolved = this._resolveKey(testId, testName, key)
    key = resolved.key
    const count = resolved.count

    // Do not mark the snapshot as "checked" if the snapshot is inline and
    // there's an external snapshot. This way the external snapshot can be
    // removed with `--updateSnapshot`.
    if (!(isInline && this._snapshotData[key] !== undefined)) {
      this._uncheckedKeys.delete(key)
    }

    let receivedSerialized =
      rawSnapshot && typeof received === 'string'
        ? (received as string)
        : serialize(received, undefined, this._snapshotFormat)

    if (!rawSnapshot) {
      receivedSerialized = addExtraLineBreaks(receivedSerialized)
    }

    if (rawSnapshot) {
      this._rawSnapshotFiles.add(rawSnapshot.file)
      // normalize EOL when snapshot contains CRLF but received is LF
      if (
        rawSnapshot.content &&
        /\r\n/.test(rawSnapshot.content) &&
        !/\r\n/.test(receivedSerialized)
      ) {
        rawSnapshot.content = normalizeNewlines(rawSnapshot.content)
      }
    }

    const expected = isInline
      ? inlineSnapshot
      : rawSnapshot
        ? rawSnapshot.content
        : this._snapshotData[key]
    const expectedTrimmed = rawSnapshot ? expected : expected?.trim()
    const pass =
      expectedTrimmed ===
      (rawSnapshot ? receivedSerialized : receivedSerialized.trim())
    const hasSnapshot = expected !== undefined
    const snapshotIsPersisted =
      isInline ||
      this._fileExists ||
      (rawSnapshot && rawSnapshot.content != null)

    if (pass && !isInline && !rawSnapshot) {
      // When the file is re-saved (because other snapshots changed), the JS
      // round-trip can lose proper escaping. Refresh in-memory data with the
      // freshly serialized string so the file is written correctly.
      // _reconcile does not write _snapshotData on pass, so this is the only
      // place it gets refreshed. Domain snapshots skip this because the stored
      // value may contain match patterns that differ from the received output.
      this._snapshotData[key] = receivedSerialized
    }

    const stack = isInline
      ? this._resolveInlineStack({
          testId,
          snapshot: receivedSerialized,
          assertionName: assertionName || 'toMatchInlineSnapshot',
          error: error || new Error('snapshot'),
        })
      : undefined

    return this._reconcile({
      testId,
      key,
      count,
      pass,
      hasSnapshot,
      snapshotIsPersisted: !!snapshotIsPersisted,
      addValue: receivedSerialized,
      actualDisplay: rawSnapshot
        ? receivedSerialized
        : removeExtraLineBreaks(receivedSerialized),
      expectedDisplay:
        expectedTrimmed !== undefined
          ? rawSnapshot
            ? expectedTrimmed
            : removeExtraLineBreaks(expectedTrimmed)
          : undefined,
      stack,
      rawSnapshot,
      assertionName,
    })
  }

  processDomainSnapshot({
    testId,
    received,
    expectedSnapshot,
    matchResult,
    isInline,
    error,
    assertionName,
  }: ProcessDomainSnapshotOptions): SnapshotReturnOptions {
    const stack = isInline
      ? this._resolveInlineStack({
          testId,
          snapshot: received,
          assertionName: assertionName!,
          error: error || new Error('STACK_TRACE_ERROR'),
        })
      : undefined
    const actualResolved = matchResult?.resolved ?? received
    const expectedResolved = matchResult?.expected ?? expectedSnapshot.data
    return this._reconcile({
      testId,
      key: expectedSnapshot.key,
      count: expectedSnapshot.count,
      pass: matchResult?.pass ?? false,
      hasSnapshot: expectedSnapshot.data !== undefined,
      snapshotIsPersisted: isInline ? true : this._fileExists,
      addValue: actualResolved,
      actualDisplay: removeExtraLineBreaks(actualResolved),
      expectedDisplay:
        expectedResolved !== undefined
          ? removeExtraLineBreaks(expectedResolved)
          : undefined,
      stack,
      assertionName,
    })
  }

  /**
   * The snapshot file, if the test file stores snapshots in it, and every asserted file snapshot.
   */
  getSnapshotFiles(): string[] {
    const files = Array.from(this._rawSnapshotFiles)
    if (this._fileExists || Object.keys(this._snapshotData).length) {
      files.unshift(this.snapshotPath)
    }
    return files
  }

  async pack(): Promise<SnapshotResult> {
    const snapshot: SnapshotResult = {
      filepath: this.testFilePath,
      added: 0,
      fileDeleted: false,
      matched: 0,
      unchecked: 0,
      uncheckedKeys: [],
      unmatched: 0,
      updated: 0,
    }
    const uncheckedCount = this.getUncheckedCount()
    const uncheckedKeys = this.getUncheckedKeys()
    if (uncheckedCount) {
      this.removeUncheckedKeys()
    }

    const status = await this.save()
    snapshot.fileDeleted = status.deleted
    snapshot.added = this.added.total()
    snapshot.matched = this.matched.total()
    snapshot.unmatched = this.unmatched.total()
    snapshot.updated = this.updated.total()
    snapshot.unchecked = !status.deleted ? uncheckedCount : 0
    snapshot.uncheckedKeys = Array.from(uncheckedKeys)

    return snapshot
  }
}
