import findUp from 'next/dist/compiled/find-up'

const getEslintFlatConfig = (compatExtendsStr: string) => {
  return `import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
});
const eslintConfig = [...compat.extends(${compatExtendsStr})];
export default eslintConfig;`
}

export const getESLintStrictValue = async (cwd: string) => {
  const tsConfigLocation = await findUp('tsconfig.json', { cwd })
  const hasTSConfig = tsConfigLocation !== undefined

  return {
    title: 'Strict',
    recommended: true,
    config: getEslintFlatConfig(
      `'next/core-web-vitals'${hasTSConfig ? ", 'next/typescript'" : ''}`
    ),
  }
}

export const getESLintPromptValues = async (cwd: string) => {
  return [
    await getESLintStrictValue(cwd),
    {
      title: 'Base',
      config: getEslintFlatConfig(`'next'`),
    },
    {
      title: 'Cancel',
      config: null,
    },
  ]
}
