/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of https://github.com/jestjs/jest.
 */

import { createTimerContext } from '../../../compiled/next-test-primitives/timers'
import { TestFakeTimersCore } from './fake-timers-core'

const timersModule = require('node:timers') as typeof import('node:timers')
const timersPromisesModule =
  require('node:timers/promises') as typeof import('node:timers/promises')
const utilModule = require('node:util') as typeof import('node:util')
const childProcessRealm = typeof process.send === 'function'

export class TestFakeTimers extends TestFakeTimersCore {
  constructor(options: ConstructorParameters<typeof TestFakeTimersCore>[0]) {
    super(options, {
      createTimerContext(global) {
        return createTimerContext(global, {
          timers: timersModule,
          timersPromises: timersPromisesModule,
          util: utilModule,
        })
      },
      isChildProcess: () => childProcessRealm,
    })
  }
}
