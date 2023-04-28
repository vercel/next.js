// In Edge, we can't load this module.
const ampValidation =
  process.env.NEXT_RUNTIME === 'edge'
    ? null
    : (require('../../../../../build/output')
        .ampValidation as typeof import('../../../../../build/output').ampValidation)

export const createAMPValidator = ampValidation
  ? (validatorPath: string | undefined) => {
      return async (html: string, pathname: string): Promise<void> => {
        const AmpHtmlValidator =
          require('next/dist/compiled/amphtml-validator') as typeof import('next/dist/compiled/amphtml-validator')

        const validator = await AmpHtmlValidator.getInstance(validatorPath)

        const result = validator.validateString(html)

        const errors = result.errors
          .filter((event) => event.severity === 'ERROR')
          // Filter the AMP development script out.
          .filter((event) => {
            if (event.code !== 'DISALLOWED_SCRIPT_TAG') {
              return true
            }

            const snippetChunks = html.split('\n')

            let snippet
            if (
              !(snippet = html.split('\n')[event.line - 1]) ||
              !(snippet = snippet.substring(event.col))
            ) {
              return true
            }

            snippet = snippet + snippetChunks.slice(event.line).join('\n')
            snippet = snippet.substring(0, snippet.indexOf('</script>'))

            return !snippet.includes('data-amp-development-mode-only')
          })

        const warnings = result.errors.filter(
          (event) => event.severity !== 'ERROR'
        )

        ampValidation(pathname, errors, warnings)
      }
    }
  : null
