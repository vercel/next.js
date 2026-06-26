/**
 * Rules being turned off (i.e. remove from snapshot) would be breaking change (requires removal of eslint-disable directive)
 * Rules being added that are turned off would not be a breaking change (no eslint-disable directive required)
 * Rules being added with a severity would be a breaking change (requires addition of eslint-disable directive)
 */
export function getEslintConfigSnapshot(eslintConfig: any) {
  return {
    ...eslintConfig,
    rules: Object.fromEntries(
      Object.entries(eslintConfig.rules).filter(
        ([, config]: [ruleName: string, config: [severity: unknown]]) => {
          const [severity] = config

          return severity !== 0 && severity !== 'off'
        }
      )
    ),
  }
}
