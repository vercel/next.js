// eslint-disable-next-line import/no-extraneous-dependencies
import validateProjectName from 'validate-npm-package-name'

type ValidateNpmNameResult =
  | {
      valid: true
    }
  | {
      valid: false
      problems: string[]
    }

export function validateNpmName(name: string): ValidateNpmNameResult {
  const nameValidation = validateProjectName(name)
  if (nameValidation.validForNewPackages) {
    return { valid: true }
  }

  return {
    valid: false,
    problems: [
      ...(nameValidation.errors || []),
      ...(nameValidation.warnings || []),
    ],
  }
}
