import type ESLint from 'eslint'

declare module 'eslint' {
  namespace Rule {
    interface RuleContext extends ESLint.Rule.RuleContext {
      getCwd(): string
    }
  }
}
