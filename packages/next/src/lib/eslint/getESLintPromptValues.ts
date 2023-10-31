import findUp from 'next/dist/compiled/find-up'

export const getESLintStrictValue = async (cwd: string) => {
  const hasTSConfig = !!(await findUp('tsconfig.json'), { cwd })

  return {
    title: 'Strict',
    recommended: true,
    config: {
      extends: hasTSConfig
        ? ['next/core-web-vitals', 'next/typescript']
        : 'next/core-web-vitals',
    },
  }
}

export const getESLintPromptValues = async (cwd: string) => {
  return [
    getESLintStrictValue(cwd),
    {
      title: 'Base',
      config: {
        extends: 'next',
      },
    },
    {
      title: 'Cancel',
      config: null,
    },
  ]
}
