import type { ValidationError } from 'next/dist/compiled/amphtml-validator'

export type ValidationErrors = {
  warnings: Array<ValidationError>
  errors: Array<ValidationError>
}

export async function validateAmp(
  rawAmpHtml: string,
  validatorPath: string | undefined
): Promise<ValidationErrors | null> {
  const AmpHtmlValidator =
    require('next/dist/compiled/amphtml-validator') as typeof import('next/dist/compiled/amphtml-validator')
  const validator = await AmpHtmlValidator.getInstance(validatorPath)
  const result = validator.validateString(rawAmpHtml)

  const errors = result.errors.filter((e) => e.severity === 'ERROR')
  const warnings = result.errors.filter((e) => e.severity !== 'ERROR')

  // If there were no errors or warnings, then return null.
  if (warnings.length === 0 && errors.length === 0) {
    return null
  }

  return { errors, warnings }
}
