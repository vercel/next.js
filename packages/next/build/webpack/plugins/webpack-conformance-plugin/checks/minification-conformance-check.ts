import {
  IWebpackConformanceTest,
  IConformanceTestResult,
  IConformanceTestStatus,
} from '../TestInterface'
import { CONFORMANCE_ERROR_PREFIX } from '../constants'
const EARLY_EXIT_RESULT: IConformanceTestResult = {
  result: IConformanceTestStatus.SUCCESS,
}

export class MinificationConformanceCheck implements IWebpackConformanceTest {
  public buildStared(options: any): IConformanceTestResult {
    if (options.output.path.endsWith('/server')) {
      return EARLY_EXIT_RESULT
    }
    // TODO(prateekbh@): Implement warning for using Terser maybe?
    const { optimization } = options
    if (
      optimization &&
      (optimization.minimize !== true ||
        (optimization.minimizer && optimization.minimizer.length === 0))
    ) {
      return {
        result: IConformanceTestStatus.FAILED,
        errors: [
          {
            message: `${CONFORMANCE_ERROR_PREFIX}: Minification is disabled for this build.\nDisabling minification can result in serious performance degradation.`,
          },
        ],
      }
    } else {
      return EARLY_EXIT_RESULT
    }
  }
}
