# Next.js Stats GitHub Action

> Downloads and runs project with provided configs gathering stats to compare branches

See it in action at Next.js https://github.com/vercel/next.js

## Getting Started

1. Add a `.stats-app` folder to your project with a [`stats-config.js`](#stats-config) and any files to run against for example a test app that is to be built
2. Add the action to your [workflow](https://help.github.com/en/articles/configuring-a-workflow)
3. Enjoy the stats

## Stats Config

```TypeScript
const StatsConfig = {
  // the Heading to show at the top of stats comments
  commentHeading: 'Stats from current PR' | undefined,
  commentReleaseHeading: 'Stats from current release' | undefined,
  // the command to build your project if not done on post install
  initialBuildCommand: undefined | string,
  skipInitialInstall: undefined | boolean,
  // the command to build the app (app source should be in `.stats-app`)
  appBuildCommand: string,
  appStartCommand: string | undefined,
  // the main branch to compare against (what PRs will be merging into)
  mainBranch: 'canary',
  // the main repository path (relative to https://github.com/)
  mainRepo: 'vercel/next.js',
  // whether to attempt auto merging the main branch into PR before running stats
  autoMergeMain: boolean | undefined,
  // an array of configs for each run
  configs: [
    { // first run's config
      // title of the run
      title: 'fastMode stats',
      // whether to diff the outputted files (default: onOutputChange)
      diff: 'onOutputChange' | false | undefined,
      // config files to add before running diff (if `undefined` uses `configFiles`)
      diffConfigFiles: [] | undefined,
      // renames to apply to make file names deterministic
      renames: [
        {
          srcGlob: 'main-*.js',
          dest: 'main.js'
        }
      ],
      // config files to add before running (removed before successive runs)
      configFiles: [
        {
          path: './next.config.js',
          content: 'module.exports = { fastMode: true }'
        }
      ],
      // an array of file groups to diff/track
      filesToTrack: [
        {
          name: 'Pages',
          globs: [
            'build/pages/**/*.js'
          ]
        }
      ],
      // an array of URLs to fetch while `appStartCommand` is running
      // will be output to fetched-pages/${pathname}.html
      pagesToFetch: [
        'https://localhost:$PORT/page-1'
      ]
    },
    { // second run's config
      title: 'slowMode stats',
      diff: false,
      configFiles: [
        {
          path: './next.config.js',
          content: 'module.exports = { slowMode: true }'
        }
      ],
      filesToTrack: [
        {
          name: 'Main Bundles',
          globs: [
            'build/runtime/webpack-*.js',
            'build/runtime/main-*.js',
          ]
        }
      ]
    },
  ]
}

module.exports = StatsConfig
```
