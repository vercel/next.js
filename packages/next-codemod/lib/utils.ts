import { yellow } from 'picocolors'
import isGitClean from 'is-git-clean'

export function checkGitStatus(force) {
  let clean = false
  let errorMessage = 'Unable to determine if git directory is clean'
  try {
    clean = isGitClean.sync(process.cwd())
    errorMessage = 'Git directory is not clean'
  } catch (err) {
    if (err && err.stderr && err.stderr.includes('Not a git repository')) {
      clean = true
    }
  }

  if (!clean) {
    if (force) {
      console.log(`WARNING: ${errorMessage}. Forcibly continuing.`)
    } else {
      console.log('Thank you for using @next/codemod!')
      console.log(
        yellow(
          '\nBut before we continue, please stash or commit your git changes.'
        )
      )
      console.log(
        '\nYou may use the --force flag to override this safety check.'
      )
      process.exit(1)
    }
  }
}

export function onCancel() {
  process.exit(1)
}

/**
 * When adding a new codemod, ensure to set the target canary version
 * instead of the stable version. This is for `@next/codemod upgrade`
 * to correctly pick up the codemod for the next pre-release version.
 * This is also essential for correctly upgrading from canary to canary.
 */
export const TRANSFORMER_INQUIRER_CHOICES = [
  {
    title:
      'Transform the deprecated automatically injected url property on top level pages to using withRouter',
    value: 'url-to-withrouter',
    version: '6.0.0',
  },
  {
    title:
      'Transforms anonymous components into named components to make sure they work with Fast Refresh',
    value: 'name-default-component',
    version: '9.0.0',
  },
  {
    title:
      'Transforms files that do not import `React` to include the import in order for the new React JSX transform',
    value: 'add-missing-react-import',
    version: '10.0.0',
  },
  {
    title:
      'Automatically migrates a Create React App project to Next.js (experimental)',
    value: 'cra-to-next',
    version: '11.0.0',
  },
  {
    title: 'Ensures your <Link> usage is backwards compatible',
    value: 'new-link',
    version: '13.0.0',
  },
  {
    title:
      'Dangerously migrates from `next/legacy/image` to the new `next/image` by adding inline styles and removing unused props (experimental)',
    value: 'next-image-experimental',
    version: '13.0.0',
  },
  {
    title:
      'Safely migrate Next.js 10, 11, 12 applications importing `next/image` to the renamed `next/legacy/image` import in Next.js 13',
    value: 'next-image-to-legacy-image',
    version: '13.0.0',
  },
  {
    title: 'Uninstall `@next/font` and transform imports to `next/font`',
    value: 'built-in-next-font',
    version: '13.2.0',
  },
  {
    title:
      'Migrates certain viewport related metadata from the `metadata` export to a new `viewport` export',
    value: 'metadata-to-viewport-export',
    version: '14.0.0',
  },
  {
    title:
      'Transforms imports from `next/server` to `next/og` for usage of Dynamic OG Image Generation',
    value: 'next-og-import',
    version: '14.0.0',
  },
  {
    title:
      'Install `@vercel/functions` to replace `geo` and `ip` properties on `NextRequest`',
    value: 'next-request-geo-ip',
    version: '15.0.0-canary.153',
  },
  {
    title: 'Transforms usage of Next.js async Request APIs',
    value: 'next-async-request-api',
    version: '15.0.0-canary.171',
  },
  {
    title:
      'Transform App Router Route Segment Config `runtime` value from `experimental-edge` to `edge`',
    value: 'app-dir-runtime-config-experimental-edge',
    version: '15.0.0-canary.179',
  },
  {
    title: 'Updates `next.config.js` to use the new `turbopack` configuration',
    value: 'next-experimental-turbo-to-turbopack',
    version: '15.4.2-canary.21',
  },
  {
    title: 'Migrate from `next lint` to the ESLint CLI',
    value: 'next-lint-to-eslint-cli',
    version: '15.4.2-canary.55',
  },
  {
    title: 'Migrate from deprecated `middleware` convention to `proxy`',
    value: 'middleware-to-proxy',
    version: '15.6.0-canary.54',
  },
  {
    title: 'Remove `unstable_` prefix from stabilized API',
    value: 'remove-unstable-prefix',
    version: '16.0.0-canary.10',
  },
  {
    title:
      'Remove `experimental_ppr` Route Segment Config from App Router pages and layouts',
    value: 'remove-experimental-ppr',
    version: '16.0.0-canary.11',
  },
]
