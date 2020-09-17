function CLIEngine() {}

CLIEngine.prototype.executeOnText = function executeOnText() {
  return {
    results: [
      {
        filePath: '',
        messages: [
          {
            ruleId: 'no-undef',
            severity: 2,
            message: 'Fake error',
            line: 1,
            column: 11,
            nodeType: 'Identifier',
            source: 'var foo = stuff',
          },
        ],
        errorCount: 2,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        source: '',
      },
    ],
    errorCount: 2,
    warningCount: 0,
    fixableErrorCount: 0,
    fixableWarningCount: 0,
  };
};

CLIEngine.prototype.getFormatter = function getFormatter(format) {
  const resolvedFormatName = format || 'stylish';

  if (typeof resolvedFormatName !== 'string') {
    return null;
  }

  const eslintVersion = require('./package.json').version;
  const formatterPath =
    eslintVersion >= '6.0.0'
      ? './lib/cli-engine/formatters/stylish'
      : './lib/formatters/stylish';

  try {
    return require(formatterPath);
  } catch (ex) {
    ex.message = `There was a problem loading formatter: ${formatterPath}\nError: ${ex.message}`;
    throw ex;
  }
};

CLIEngine.getFormatter = CLIEngine.prototype.getFormatter;

module.exports = {
  CLIEngine,
};
