import {
  IWebpackConformanceTest,
  IConformanceTestResult,
  IConformanceTestStatus,
} from '../TestInterface'
import { CONFORMANCE_ERROR_PREFIX } from '../constants'

export class MinificationConformanceCheck implements IWebpackConformanceTest {
  public buildStared(options: any): IConformanceTestResult {
    // TODO(prateekbh@): Implement warning for using Terser maybe?

    if (options.optimization.minimize === false) {
      return {
        result: IConformanceTestStatus.FAILED,
        errors: [
          {
            message: `${CONFORMANCE_ERROR_PREFIX}: Minification is disabled for this build.\nDisabling minification can result in serious performance degradation.`,
          },
        ],
      }
    } else {
      return {
        result: IConformanceTestStatus.SUCCESS,
      }
    }
  }
}
