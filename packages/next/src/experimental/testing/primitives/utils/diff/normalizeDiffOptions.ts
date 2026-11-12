/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { CompareKeys } from '../../pretty-format/index'
import type { DiffOptions, DiffOptionsNormalized } from './types'
import c from '../colors'

const noColor = (string: string): string => string

const DIFF_CONTEXT_DEFAULT = 5
const DIFF_TRUNCATE_THRESHOLD_DEFAULT = 0 // not truncate

function getDefaultOptions(): DiffOptionsNormalized {
  return {
    aAnnotation: 'Expected',
    aColor: c.green,
    aIndicator: '-',
    bAnnotation: 'Received',
    bColor: c.red,
    bIndicator: '+',
    changeColor: c.inverse,
    changeLineTrailingSpaceColor: noColor,
    commonColor: c.dim,
    commonIndicator: ' ',
    commonLineTrailingSpaceColor: noColor,
    compareKeys: undefined,
    contextLines: DIFF_CONTEXT_DEFAULT,
    emptyFirstOrLastLinePlaceholder: '',
    expand: false,
    includeChangeCounts: false,
    omitAnnotationLines: false,
    patchColor: c.yellow,
    printBasicPrototype: false,
    truncateThreshold: DIFF_TRUNCATE_THRESHOLD_DEFAULT,
    truncateAnnotation: '... Diff result is truncated',
    truncateAnnotationColor: noColor,
  }
}

function getCompareKeys(compareKeys?: CompareKeys): CompareKeys {
  return compareKeys && typeof compareKeys === 'function'
    ? compareKeys
    : undefined
}

function getContextLines(contextLines?: number): number {
  return typeof contextLines === 'number' &&
    Number.isSafeInteger(contextLines) &&
    contextLines >= 0
    ? contextLines
    : DIFF_CONTEXT_DEFAULT
}

// Pure function returns options with all properties.
export function normalizeDiffOptions(
  options: DiffOptions = {}
): DiffOptionsNormalized {
  return {
    ...getDefaultOptions(),
    ...options,
    compareKeys: getCompareKeys(options.compareKeys),
    contextLines: getContextLines(options.contextLines),
  }
}
