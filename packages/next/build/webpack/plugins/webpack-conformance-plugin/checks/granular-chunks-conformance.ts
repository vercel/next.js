import chalk from 'chalk'
import {
  CONFORMANCE_ERROR_PREFIX,
  CONFORMANCE_WARNING_PREFIX,
} from '../constants'
import {
  IConformanceTestResult,
  IConformanceTestStatus,
  IWebpackConformanceTest,
} from '../TestInterface'
import { deepEqual } from '../utils/utils'

export interface GranularChunksConformanceCheck
  extends IWebpackConformanceTest {
  granularChunksConfig: any
}

function getWarningMessage(modifiedProp: string) {
  return (
    `${CONFORMANCE_WARNING_PREFIX}: The splitChunks config has been carefully ` +
    `crafted to optimize build size and build times. Modifying - ${chalk.bold(
      modifiedProp
    )} could result in slower builds and increased code duplication`
  )
}

function getErrorMessage(message: string) {
  return (
    `${CONFORMANCE_ERROR_PREFIX}: The splitChunks config has been carefully ` +
    `crafted to optimize build size and build times. Please avoid changes to ${chalk.bold(
      message
    )}`
  )
}

export class GranularChunksConformanceCheck {
  constructor(granularChunksConfig: any) {
    this.granularChunksConfig = granularChunksConfig
  }

  public buildStared(options: any): IConformanceTestResult {
    const userSplitChunks = options.optimization.splitChunks
    const warnings = []
    const errors = []

    if (
      userSplitChunks.maxInitialRequests !==
      this.granularChunksConfig.maxInitialRequests
    ) {
      warnings.push('splitChunks.maxInitialRequests')
    }

    if (userSplitChunks.minSize !== this.granularChunksConfig.minSize) {
      warnings.push('splitChunks.minSize')
    }

    const userCacheGroup = userSplitChunks.cacheGroups
    const originalCacheGroup = this.granularChunksConfig.cacheGroups

    if (userCacheGroup.vendors !== false) {
      errors.push('splitChunks.cacheGroups.vendors')
    }

    if (!deepEqual(userCacheGroup.framework, originalCacheGroup.framework)) {
      errors.push('splitChunks.cacheGroups.framework')
    }

    if (!deepEqual(userCacheGroup.lib, originalCacheGroup.lib)) {
      errors.push('splitChunks.cacheGroups.lib')
    }

    if (!deepEqual(userCacheGroup.commons, originalCacheGroup.commons)) {
      errors.push('splitChunks.cacheGroups.commons')
    }

    if (!deepEqual(userCacheGroup.shared, originalCacheGroup.shared)) {
      errors.push('splitChunks.cacheGroups.shared')
    }

    if (!warnings.length && !errors.length) {
      return {
        result: IConformanceTestStatus.SUCCESS,
      }
    }

    const failedResult: IConformanceTestResult = {
      result: IConformanceTestStatus.FAILED,
    }

    if (warnings.length) {
      failedResult.warnings = warnings.map((warning) => ({
        message: getWarningMessage(warning),
      }))
    }

    if (errors.length) {
      failedResult.warnings = errors.map((error) => ({
        message: getErrorMessage(error),
      }))
    }

    return failedResult
  }
}
