import NodeEnvironment from 'jest-environment-node'
import * as path from 'node:path'
import type { Circus } from '@jest/types'
import type {
  JestEnvironmentConfig,
  EnvironmentContext,
} from '@jest/environment'
import { formatTestName, TEST_CONTEXT_SYMBOL, TestSuiteContext } from './shared'

// Based on: https://github.com/jestjs/jest/issues/7774#issuecomment-1302844729

class JestReflectionNodeEnvironment extends NodeEnvironment {
  constructor(config: JestEnvironmentConfig, context: EnvironmentContext) {
    super(config, context)
    const suiteStartTime = Date.now()

    const rootDir = config.projectConfig.rootDir
    const testPathRelativeToTestDir = path.relative(rootDir, context.testPath)

    // compute the relative path of the test, including the name of rootDir
    // (this gives us a filepath starting with "test/")
    const testPathRelativeToRepo = path.join(
      path.basename(rootDir),
      testPathRelativeToTestDir
    )

    const injectedContext: TestSuiteContext = {
      rootDir,
      suiteStartTime,
      testPathRelativeToRepo,
      testPathRelativeToTestDir,
      currentTest: null,
    }

    Object.defineProperty(this.global, TEST_CONTEXT_SYMBOL, {
      value: injectedContext,
      writable: true,
      enumerable: false,
    })
  }

  async handleTestEvent(event: Circus.Event, _state: Circus.State) {
    const context = (this.global[TEST_CONTEXT_SYMBOL] ??
      null) as TestSuiteContext | null
    if (!context) {
      return
    }
    if (event.name === 'test_start') {
      const nameStack = getTestNameStack(event.test)
      if (event.test.concurrent) {
        // if the test concurrent, we can't reliably set currentTest on the global. warn and bail out
        const testName = formatTestName(nameStack)
        console.warn(
          `Cannot expose test context for a concurrent test\n  ${testName}\n  in ${context.testPathRelativeToRepo}`
        )
        context.currentTest = null
      } else {
        context.currentTest = {
          nameStack,
          status: 'before',
        }
      }
      return
    }

    if (context.currentTest) {
      if (event.name === 'test_fn_start') {
        context.currentTest.status = 'running'
      } else if (event.name === 'test_fn_success') {
        context.currentTest.status = 'success'
      } else if (event.name === 'test_fn_failure') {
        context.currentTest.status = 'failure'
      } else if (event.name === 'test_done') {
        // all afterEach hooks are done, we can clear currentTest
        context.currentTest = null
      }
    }
  }
}

function getTestNameStack(test: Circus.TestEntry) {
  let nameStack: string[] = [test.name]

  // walk up the test stack and collect the names of each parent describe block
  let current: Circus.DescribeBlock | undefined = test.parent
  while (current && !(current.name === 'ROOT_DESCRIBE_BLOCK')) {
    nameStack.push(current.name)
    current = current.parent
  }
  nameStack.reverse()

  return nameStack
}

export default JestReflectionNodeEnvironment
