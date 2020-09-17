# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [4.0.2](https://github.com/webpack-contrib/eslint-loader/compare/v3.0.4...v4.0.2) (2020-04-24)


### Bug Fixes

* use fs-extra ^8.1.0 ([7febae0](https://github.com/webpack-contrib/eslint-loader/commit/7febae056ac6271c4cf76b8e387f8fae5800a879))

### [4.0.1](https://github.com/webpack-contrib/eslint-loader/compare/v3.0.4...v4.0.1) (2020-04-24)

### Refactor

* new cache implementation ([#320](https://github.com/webpack-contrib/eslint-loader/pull/320)) ([6bb1fa6](https://github.com/webpack-contrib/eslint-loader/commit/acae2be88678228e6589b40122a93f88437b8e47))

## [4.0.0](https://github.com/webpack-contrib/eslint-loader/compare/v3.0.4...v4.0.0) (2020-04-03)

### Breaking Changes

* drop support for Node < 10.13.0
* minimum supported eslint version is 6

### [3.0.4](https://github.com/webpack-contrib/eslint-loader/compare/v3.0.3...v3.0.4) (2020-04-02)


### Bug Fixes

* [#316](https://github.com/webpack-contrib/eslint-loader/issues/316) updating loader-fs-cache min version ([#317](https://github.com/webpack-contrib/eslint-loader/issues/317)) ([796e3d1](https://github.com/webpack-contrib/eslint-loader/commit/796e3d130a030ce48e14ee3421809ca40d25cde1))

### [3.0.3](https://github.com/webpack-contrib/eslint-loader/compare/v3.0.2...v3.0.3) (2019-12-06)


### Bug Fixes

* check result object ([#311](https://github.com/webpack-contrib/eslint-loader/issues/311)) ([6bb1fa6](https://github.com/webpack-contrib/eslint-loader/commit/6bb1fa68d043f00de63cda4d9babd3a2c9a50d58))
* support webpack 5 ([#312](https://github.com/webpack-contrib/eslint-loader/issues/312)) ([c0a9d0c](https://github.com/webpack-contrib/eslint-loader/commit/c0a9d0c118155c56c41dc344460f333a9e969eaf))

### [3.0.2](https://github.com/webpack-contrib/eslint-loader/compare/v3.0.1...v3.0.2) (2019-09-27)


### Bug Fixes

* check if contain results ([#300](https://github.com/webpack-contrib/eslint-loader/issues/300)) ([7d1d1fe](https://github.com/webpack-contrib/eslint-loader/commit/7d1d1fe))
* ensure output file path ([#299](https://github.com/webpack-contrib/eslint-loader/issues/299)) ([16e9ccf](https://github.com/webpack-contrib/eslint-loader/commit/16e9ccf))

### [3.0.1](https://github.com/webpack-contrib/eslint-loader/compare/v3.0.0...v3.0.1) (2019-09-25)


### Bug Fixes

* module build failed error at Linter.parseResults ([#294](https://github.com/webpack-contrib/eslint-loader/issues/294)) ([360e69c](https://github.com/webpack-contrib/eslint-loader/commit/360e69c))

### [3.0.0](https://github.com/webpack-contrib/eslint-loader/compare/v2.2.1...v3.0.0) (2019-08-24)


### Bugfix

* fix corrupted filenames if cwd == "/"
* cannot use string formatter in outputReport
* no Output Report in File when build fails under webpack 4
* add posibility to use absolute file path in outputReport.filePath
* it should be possible to use absolute file path in outputReport.filePath
* try load official formatter ([#285](https://github.com/webpack-contrib/eslint-loader/issues/285)) ([997cce5](https://github.com/webpack-contrib/eslint-loader/commit/997cce5))
* emit warning/error if no config was found/given ([#286](https://github.com/webpack-contrib/eslint-loader/issues/286)) ([4204560](https://github.com/webpack-contrib/eslint-loader/commit/4204560))


### Features

* validate schema options


### Breaking Changes

* drop support for Node < 8.9.0
* minimum supported webpack version is 4
* minimum supported eslint version is 5



# 2.2.1 - 2019-07-04

- Fixed: path to eslint version for cache
  ([#282](https://github.com/webpack-contrib/eslint-loader/issues/282) - @ricardogobbosouza)

# 2.2.0 - 2019-07-03

- [Add ESLint 6 support](https://github.com/webpack-contrib/eslint-loader/commit/b6c3938aae61c0390ac8d941af50cf36df14cfc3) by @HDuck

# 2.1.2 - 2019-01-31

- [Fix autofix for eslint < 5](https://github.com/webpack-contrib/eslint-loader/commit/d76372676b8badf57df3d6a22be5739d19e25637) by @eschablowski

# 2.1.1 - 2018-09-19

- [Stop autofixing infinite loop](https://github.com/webpack-contrib/eslint-loader/commit/704024864f737a487ec0b9f9c9b00b11881f2558) by @eschablowski
- [Allow `formatter` to receive string (path) to file exporting formatter function](https://github.com/webpack-contrib/eslint-loader/commit/7108379e2864f6ffb75cde1d147ee1fe86890ba8) by @Timer

# 2.1.0 - 2018-07-19

- [Add ESLint 5 support](https://github.com/webpack-contrib/eslint-loader/commit/1dc9442d9e2344b953ac88c5c416dcb79f3c690d) by @Alex-Sokolov
- [Fix not returning execution flow control to webpack when cache option is enabled and one of the files has a linting error](https://github.com/webpack-contrib/eslint-loader/commit/97761d724e6fa26d8dbde4a544ddb7cb3795f568) by @nicolaslt
- dev deps updates, prettier, eslint config [...](https://github.com/webpack-contrib/eslint-loader/compare/2.0.0...2.1.0)

# 2.0.0 - 2018-02-26

- 🚨 Drop webpack@1.x support (by @wonism in [#212](https://github.com/webpack-contrib/eslint-loader/pull/212))
- 🚨 Drop Node 4 supported (by @wonism in [#212](https://github.com/webpack-contrib/eslint-loader/pull/212))
- ✨ Add webpack@4.x support (by @wonism in [#212](https://github.com/webpack-contrib/eslint-loader/pull/212))
- 🐛 Respect `eslintPath` for formatter (by @lmnsg in [#195](https://github.com/webpack-contrib/eslint-loader/pull/195))

# 1.9.0 - 2017-07-06

- Added: `eslintPath` option so you can provide your own eslint path.
  ([#183](https://github.com/webpack-contrib/eslint-loader/pull/183) - @trungdq88)

# 1.8.0 - 2017-06-15

- Added: support for eslint@^4.0.0
  ([#178](https://github.com/webpack-contrib/eslint-loader/issues/178) - @Aladdin-ADD)

# 1.7.1 - 2017-03-31

- Fixed: Remove duplicate output with webpack 2
  ([#169](https://github.com/webpack-contrib/eslint-loader/pull/169) - @jaridmargolin)

# 1.7.0 - 2017-03-23

- Fixed: outputReport option writes report for last file checked only
  ([#160](https://github.com/webpack-contrib/eslint-loader/pull/160) - @deryni)
- Added: use babel loader fs cache as the default caching engine
  ([#159](https://github.com/webpack-contrib/eslint-loader/pull/159) - @viankakrisna)

# 1.6.3 - 2017-02-22

- Fixed: ignore cache when eslint rules have changed
  ([#151](https://github.com/webpack-contrib/eslint-loader/pull/151) - @wrakky)

# 1.6.2 - 2017-02-22

- Fixed: fallback to OS temp directory if findCacheDir fails
  ([#154](https://github.com/webpack-contrib/eslint-loader/pull/154) - @viankakrisna)
- Fixed: `loader-utils` deprecation warning by upgrading to v1.0.0
  ([#155](https://github.com/webpack-contrib/eslint-loader/pull/155) - @fknussel)

# 1.6.1 - 2016-11-02

- Fixed: multiples config per instance are now supported
  ([#105](https://github.com/webpack-contrib/eslint-loader/issues/105) -
  @jaythomas and @jameslnewell)

# 1.6.0 - 2016-10-17

- Added: Option to generate report file
  ([#118](https://github.com/webpack-contrib/eslint-loader/pull/118) - @vidhill)

# 1.5.0 - 2016-07-28

- Added: `cache` options
  ([#93](https://github.com/webpack-contrib/eslint-loader/pull/93) - @genintho)

# 1.4.1 - 2016-06-07

- Fixed: .eslintignore is not ignored anymore (eslint 3.x regression)
  ([#99](https://github.com/webpack-contrib/eslint-loader/pull/99) - @waiterZen)

# 1.4.0 - 2016-06-02

- Added: support for eslint@^3.0.0
  ([#96](https://github.com/webpack-contrib/eslint-loader/issues/96))

# 1.3.0 - 2016-02-17

- Added: support for eslint@^2.0.0
  ([#81](https://github.com/webpack-contrib/eslint-loader/pull/81))

# 1.2.1 - 2016-01-26

- Updated: object-assign dependency
  ([#77](https://github.com/webpack-contrib/eslint-loader/pull/77))

# 1.2.0 - 2016-01-02

- Added: this loader now pass down the input source map to the next chained
  loader if it exists
  ([#70](https://github.com/webpack-contrib/eslint-loader/pull/70)).

# 1.1.1 - 2015-10-08

- Fixed: `failOnError` and `failOnWarning` now print messages.

# 1.1.0 - 2015-10-08

- Added: `fix` option to enable ESLint auto fix feature.

# 1.0.0 - 2015-08-08

- Added: support for eslint 1.x
- Removed: support for eslint 1.x-rc\*
- Removed: support for eslint 0.x

# 0.14.2 - 2015-07-18

- Fixed: support for eslint 1.x-rc

# 0.14.1 - 2015-06-15

- Fixed: support for eslint 0.24.x

# 0.14.0 - 2015-06-15

- Added: support for eslint 0.23.x

# 0.13.0 - 2015-06-14

- Changed: a file that should be ignored doesn't trigger a warning
  ([#44](https://github.com/webpack-contrib/eslint-loader/issues/44))

# 0.12.0 - 2015-06-04

- Changed: upgrade to eslint 0.22.x
- Fixed: respect .eslintrc/eslintignore files in directory tree
  ([#21](https://github.com/webpack-contrib/eslint-loader/issues/21))

# 0.11.2 - 2015-05-11

- Fixed: eslint range from 0.17 to 0.21

# 0.11.1 - 2015-04-27

- Fixed: eslint range from 0.17 to 0.20

# 0.11.0 - 2015-04-27

- Changed: upgrade to eslint 0.20.x

# 0.10.0 - 2015-04-13

- Changed: upgrade to eslint 0.19.x

# 0.9.0 - 2015-03-29

- Changed: upgrade to eslint 0.18.x

# 0.8.0 - 2015-03-27

- Changed: `reporter` is now `formatter` option to fit eslint name
- Changed: plugin is now async as it don't need to be sync
- Added: options are supported as query strings

# 0.7.0 - 2015-03-15

- Changed: upgrade to eslint 0.17.x
- Added: `failOnError` option
- Added: `failOnWarning` option

# 0.6.0 - 2015-03-11

- Changed: `reporter` now automatically drop lines that contains the filename in
  the reporter output.
  That mean you can use official or community reporters without worrying to see
  lot of lines with `<text>` as filename :)

# 0.5.0 - 2015-03-11

- Changed: upgrade to eslint 0.16.x
- Changed: `emitErrors` is now `emitError`
- Changed: loader now use `webpack.emitError` or `webpack.emitWarning`
  automatically (according to eslint configuration).
  You can still override by using `emitError` or `emitWarning` options to override
  this behavior
- Added: `emitWarning` can force eslint to report warning instead of the default
  behavior (see above)
- Added: `quiet` option to hide warnings

# 0.4.0 - 2015-02-23

- Changed: upgrade to eslint 0.15.x
- Changed: more readable default reporter
- Added: `reporter` options allow to define a custom reporter function

# 0.3.0 - 2015-02-10

- Changed: upgrade to eslint 0.14.x

# 0.2.1 - 2015-01-27

- Changed: upgrade to eslint 0.13.x

# 0.2.0 - 2015-01-23

- Changed: upgrade to eslint 0.12.x
- Added: enable loading of eslint config from webpack config, `.eslintrc`, or
  `package.json`

# 0.1.0 - 2014-12-05

✨ Initial release
