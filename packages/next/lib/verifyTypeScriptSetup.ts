import fs from 'fs'
import os from 'os'
import path from 'path'
import chalk from 'chalk'
import findUp from 'find-up'
import resolve from 'resolve'
import { promisify } from 'util'
import { recursiveReadDir } from './recursive-readdir'

const stat = promisify(fs.stat)
const exists = promisify(fs.exists)
const readdir = promisify(fs.readdir)
const writeFile = promisify(fs.writeFile)

function writeJson(fileName: string, object: object): Promise<void> {
  return writeFile(
    fileName,
    JSON.stringify(object, null, 2).replace(/\n/g, os.EOL) + os.EOL,
  );
}

async function verifyNoTypeScript(dir: string) {
  const typescriptFiles = []
  const firstDepth = (await readdir(dir)).filter(
    (path) => path !== 'node_modules',
  ).map((p) => path.join(dir, p))

  for (const curPath of firstDepth) {
    const info = await stat(curPath)

    if (info.isFile() && !curPath.match(/.*\.d\.ts/)) {
      typescriptFiles.push(curPath)
    }
    if (info.isDirectory()) {
      const curFiles = (await recursiveReadDir(curPath, /.*\.ts/)).map((file) => path.join(curPath, file))
      typescriptFiles.push(
        ...curFiles.filter((file) => !file.match(/.*\.d\.ts/)),
      )
    }
  }

  if (typescriptFiles.length > 0) {
    console.warn(
      chalk.yellow(
        `We detected TypeScript in your project (${chalk.bold(
          `src${path.sep}${typescriptFiles[0]}`,
        )}) and created a ${chalk.bold('tsconfig.json')} file for you.`,
      ),
    );
    console.warn();
    return false;
  }
  return true;
}

export default async function verifyTypeScriptSetup(dir: string) {
  let firstTimeSetup = false;
  const tsConfig = path.resolve(dir, 'tsconfig.json')
  const yarnLockFile = path.resolve(dir, 'yarn.lock')
  const nodeModules = (await findUp('node_modules', { cwd: dir }))!

  if (!(await exists(tsConfig))) {
    if (await verifyNoTypeScript(dir)) {
      return;
    }
    await writeJson(tsConfig, {});
    firstTimeSetup = true;
  }
  const isYarn = await exists(yarnLockFile);

  // Ensure typescript is installed
  let ts: typeof import('typescript');
  try {
    ts = require(resolve.sync('typescript', {
      basedir: nodeModules,
    }));
  } catch (_) {
    console.error(
      chalk.bold.red(
        `It looks like you're trying to use TypeScript but do not have ${chalk.bold(
          'typescript',
        )} installed.`,
      ),
    );
    console.error(
      chalk.bold(
        'Please install',
        chalk.cyan.bold('typescript'),
        'by running',
        chalk.cyan.bold(
          isYarn ? 'yarn add typescript' : 'npm install typescript',
        ) + '.',
      ),
    );
    console.error(
      chalk.bold(
        'If you are not trying to use TypeScript, please remove the ' +
          chalk.cyan('tsconfig.json') +
          ' file from your package root (and any TypeScript files).',
      ),
    );
    console.error();
    process.exit(1);
    return
  }

  const compilerOptions: any = {
    // These are suggested values and will be set when not present in the
    // tsconfig.json
    // 'parsedValue' matches the output value from ts.parseJsonConfigFileContent()
    target: {
      parsedValue: ts.ScriptTarget.ES5,
      suggested: 'es5',
    },
    lib: { suggested: ['dom', 'dom.iterable', 'esnext'] },
    allowJs: { suggested: true },
    skipLibCheck: { suggested: true },
    esModuleInterop: { suggested: true },
    allowSyntheticDefaultImports: { suggested: true },
    strict: { suggested: true },
    forceConsistentCasingInFileNames: { suggested: true },

    // These values are required and cannot be changed by the user
    // Keep this in sync with the webpack config
    module: {
      parsedValue: ts.ModuleKind.ESNext,
      value: 'esnext',
      reason: 'for import() and import/export',
    },
    moduleResolution: {
      parsedValue: ts.ModuleResolutionKind.NodeJs,
      value: 'node',
      reason: 'to match webpack resolution',
    },
    resolveJsonModule: { value: true, reason: 'to match webpack loader' },
    isolatedModules: { value: true, reason: 'implementation limitation' },
    noEmit: { value: true },
    jsx: {
      parsedValue: ts.JsxEmit.Preserve,
      value: 'preserve',
      reason: 'JSX is compiled by Babel',
    },
    paths: { value: undefined, reason: 'aliased imports are not supported' },
  };

  const formatDiagnosticHost = {
    getCanonicalFileName: (fileName: string) => fileName,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => os.EOL,
  };

  const messages = [];
  let appTsConfig;
  let parsedTsConfig;
  let parsedCompilerOptions;
  try {
    const { config: readTsConfig, error } = ts.readConfigFile(
      tsConfig,
      ts.sys.readFile,
    );

    if (error) {
      throw new Error(ts.formatDiagnostic(error, formatDiagnosticHost));
    }

    appTsConfig = readTsConfig;

    // Get TS to parse and resolve any "extends"
    // Calling this function also mutates the tsconfig above,
    // adding in "include" and "exclude", but the compilerOptions remain untouched
    parsedTsConfig = readTsConfig
    const result = ts.parseJsonConfigFileContent(
      readTsConfig,
      ts.sys,
      path.dirname(tsConfig),
    );

    if (result.errors && result.errors.length) {
      throw new Error(
        ts.formatDiagnostic(result.errors[0], formatDiagnosticHost),
      );
    }

    parsedCompilerOptions = result.options;
  } catch (e) {
    if (e && e.name === 'SyntaxError') {
      console.error(
        chalk.red.bold(
          'Could not parse',
          chalk.cyan('tsconfig.json') + '.',
          'Please make sure it contains syntactically correct JSON.',
        ),
      );
    }

    console.info(e && e.message ? `${e.message}` : '');
    process.exit(1);
    return
  }

  if (appTsConfig.compilerOptions == null) {
    appTsConfig.compilerOptions = {};
    firstTimeSetup = true;
  }

  for (const option of Object.keys(compilerOptions)) {
    const { parsedValue, value, suggested, reason } = compilerOptions[option];

    const valueToCheck = parsedValue === undefined ? value : parsedValue;
    const coloredOption = chalk.cyan('compilerOptions.' + option);

    if (suggested != null) {
      if (parsedCompilerOptions[option] === undefined) {
        appTsConfig.compilerOptions[option] = suggested;
        messages.push(
          `${coloredOption} to be ${chalk.bold(
            'suggested',
          )} value: ${chalk.cyan.bold(suggested)} (this can be changed)`,
        );
      }
    } else if (parsedCompilerOptions[option] !== valueToCheck) {
      appTsConfig.compilerOptions[option] = value;
      messages.push(
        `${coloredOption} ${chalk.bold(
          valueToCheck == null ? 'must not' : 'must',
        )} be ${valueToCheck == null ? 'set' : chalk.cyan.bold(value)}` +
          (reason != null ? ` (${reason})` : ''),
      );
    }
  }

  // tsconfig will have the merged "include" and "exclude" by this point
  if (parsedTsConfig.include == null) {
    appTsConfig.include = ['**/*.ts', '**/*.tsx'];
    messages.push(
      `${chalk.cyan('include')} should be ${chalk.cyan.bold('src')}`,
    );
  }

  if (messages.length > 0) {
    if (firstTimeSetup) {
      console.info(
        chalk.bold(
          'Your',
          chalk.cyan('tsconfig.json'),
          'has been populated with default values.',
        ),
      );
      console.info();
    } else {
      console.warn(
        chalk.bold(
          'The following changes are being made to your',
          chalk.cyan('tsconfig.json'),
          'file:',
        ),
      );
      messages.forEach((message) => {
        console.warn('  - ' + message);
      });
      console.warn();
    }
    await writeJson(tsConfig, appTsConfig);
  }
}
