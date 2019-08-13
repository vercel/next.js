/* eslint-env jest */
import { transform } from '@babel/core'

const trim = s =>
  s
    .join('\n')
    .trim()
    .replace(/^\s+/gm, '')

// avoid generating __source annotations in JSX during testing:
process.env.NODE_ENV = 'production'

const babel = (code, esm = false) =>
  transform(code, {
    filename: 'noop.js',
    presets: [require('next/dist/build/babel/preset')],
    babelrc: false,
    configFile: false,
    sourceType: 'module',
    compact: true,
    caller: {
      name: 'tests',
      supportsStaticESM: esm
    }
  }).code

describe('next/babel', () => {
  it('should transform JSX to use a local identifier in modern mode', () => {
    const output = babel(`const a = () => <a href="/">home</a>;`, true)

    // it should add a React import:
    expect(output).toMatch(`import React from"react"`)
    // it should hoist JSX factory to a module level variable:
    expect(output).toMatch(`var __jsx=React.createElement`)
    // it should use that factory for all JSX:
    expect(output).toMatch(`__jsx("a",{href:"/"`)

    expect(
      babel(`const a = ()=><a href="/">home</a>`, true)
    ).toMatchInlineSnapshot(
      `"import React from\\"react\\";var __jsx=React.createElement;import React from\\"react\\";var a=function a(){return __jsx(\\"a\\",{href:\\"/\\"},\\"home\\");};"`
    )
  })

  it('should transform JSX to use a local identifier in CommonJS mode', () => {
    const output = babel(trim`
      const a = () => <React.Fragment><a href="/">home</a></React.Fragment>;
    `)

    // Grab generated names from the compiled output.
    // It looks something like this:
    //   var _react = _interopRequireDefault(require("react"));
    //   var __jsx = _react["default"].createElement;
    // react: _react
    // reactNamespace: _react["default"]
    const [, react, reactNamespace] = output.match(
      /(([a-z0-9_]+)(\[[^\]]*?\]|\.[a-z0-9_]+)*?)\.Fragment/i
    )

    expect(output).toMatch(`var ${reactNamespace}=`)
    expect(output).toMatch(`require("react")`)
    expect(output).toMatch(`var __jsx=${react}.createElement`)
    // Fragment should use the same React namespace import:
    expect(output).toMatch(`__jsx(${react}.Fragment`)
    expect(output).toMatch(`__jsx("a",{href:"/"`)

    expect(babel(`const a = ()=><a href="/">home</a>`)).toMatchInlineSnapshot(
      `"\\"use strict\\";var _interopRequireDefault=require(\\"@babel/runtime-corejs2/helpers/interopRequireDefault\\");var _react=_interopRequireDefault(require(\\"react\\"));var __jsx=_react[\\"default\\"].createElement;var a=function a(){return __jsx(\\"a\\",{href:\\"/\\"},\\"home\\");};"`
    )
  })
})
