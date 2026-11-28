import nextPlugin from '@next/eslint-plugin-next'

const unsupportedRule = '@next/next/no-location-assign-relative-destination'

const config = {
  plugins: ['nextjs' as const],
  rules: Object.fromEntries(
    Object.entries(nextPlugin.configs['core-web-vitals'].rules ?? {})
      .filter(([rule]) => rule !== unsupportedRule)
      .map(([rule, severity]) => [
        rule.replace('@next/next/', 'nextjs/'),
        severity,
      ])
  ),
}

export = config
