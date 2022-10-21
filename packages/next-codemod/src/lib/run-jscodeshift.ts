// @ts-ignore internal module
import Runner from 'jscodeshift/src/Runner'

export default function runJscodeshift(
  transformerPath: string,
  flags: { [key: string]: any },
  files: string[]
) {
  // we run jscodeshift in the same process to be able to
  // share state between the main CRA transform and sub-transforms
  return Runner.run(transformerPath, files, {
    ignorePattern: ['**/node_modules/**', '**/.next/**', '**/build/**'],
    extensions: 'tsx,ts,jsx,js',
    parser: 'tsx',
    verbose: 2,
    runInBand: true,
    ...flags,
  })
}
