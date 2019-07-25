declare module 'validate-npm-package-name' {
  function validate(
    projectName: string
  ): {
    validForNewPackages: boolean
    validForOldPackages: boolean
    errors?: string[] | null
    warnings?: string[] | null
  }

  export default validate
}
