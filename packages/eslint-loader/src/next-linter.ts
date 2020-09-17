import Linter from './Linter';
import { CLIEngine, Linter as ESLinter, AST } from 'eslint';

export class NextLinter extends Linter {
  private _lint:ESLinter;
  constructor(loaderContext: any, options: any) {
    super(loaderContext, options);
    this._lint = new ESLinter({});
  }

  calculateStatsPerFile(messages: ESLinter.LintMessage[]) {
    return messages.reduce((stat, message) => {
        if (message.fatal || message.severity === 2) {
            stat.errorCount++;
            if (message.fix) {
                stat.fixableErrorCount++;
            }
        } else {
            stat.warningCount++;
            if (message.fix) {
                stat.fixableWarningCount++;
            }
        }
        return stat;
    }, {
        errorCount: 0,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0
    });
}

  lint(content:string | Buffer): NextLintResult {
    const messages = this._lint.verify(content.toString(), {})
    const stats = this.calculateStatsPerFile(messages);
    const result: CLIEngine.LintResult = {
      filePath: this.resourcePath,
      messages,
      usedDeprecatedRules: [],
      ...stats
    };
    const report: CLIEngine.LintReport = {
      results: [result],
      ...stats,
      usedDeprecatedRules: []
    };
    return { report , ast: null } //this._lint.getSourceCode()?.ast };
  }
}
