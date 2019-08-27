/* eslint-env jest */
import { transform } from '@babel/core'

const trim = s =>
  s
    .join('\n')
    .trim()
    .replace(/^\s+/gm, '')

// avoid generating __source annotations in JSX during testing:
const NODE_ENV = process.env.NODE_ENV
process.env.NODE_ENV = 'production'
const preset = require('next/dist/build/babel/preset')
process.env.NODE_ENV = NODE_ENV

const babel = (code, esm = false, presetOptions = {}) =>
  transform(code, {
    filename: 'noop.js',
    presets: [[preset, presetOptions]],
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
  describe('jsx-pragma', () => {
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
        `"import React from\\"react\\";var __jsx=React.createElement;var a=function a(){return __jsx(\\"a\\",{href:\\"/\\"},\\"home\\");};"`
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

    it('should support Fragment syntax', () => {
      const output = babel(`const a = () => <>hello</>;`, true)

      expect(output).toMatch(`React.Fragment`)

      expect(babel(`const a = () => <>hello</>;`, true)).toMatchInlineSnapshot(
        `"import React from\\"react\\";var __jsx=React.createElement;var a=function a(){return __jsx(React.Fragment,null,\\"hello\\");};"`
      )
    })

    it('should support commonjs', () => {
      const output = babel(
        trim`
        const React = require('react');
        module.exports = () => <div>test2</div>;
      `,
        true
      )

      expect(output).toMatchInlineSnapshot(
        `"var React=require('react');var __jsx=React.createElement;module.exports=function(){return __jsx(\\"div\\",null,\\"test2\\");};"`
      )
    })
  })

  describe('optimize-hook-destructuring', () => {
    it('should transform Array-destructured hook return values use object destructuring', () => {
      const output = babel(
        trim`
        import { useState } from 'react';
        const [count, setCount] = useState(0);
      `,
        true
      )

      expect(output).toMatch(trim`
        var _useState=useState(0),count=_useState[0],setCount=_useState[1];
      `)

      expect(output).toMatchInlineSnapshot(
        `"import{useState}from'react';var _useState=useState(0),count=_useState[0],setCount=_useState[1];"`
      )
    })

    it('should be able to ignore some Array-destructured hook return values', () => {
      const output = babel(
        trim`
        import { useState } from 'react';
        const [, setCount] = useState(0);
      `,
        true
      )

      expect(output).toMatch(trim`
        var _useState=useState(0),setCount=_useState[1];
      `)

      expect(output).toMatchInlineSnapshot(
        `"import{useState}from'react';var _useState=useState(0),setCount=_useState[1];"`
      )
    })
  })

  describe('experimental-modern-preset', () => {
    it('should allow passing a custom Babel preset', () => {
      const code = trim`
        const [, b, c] = [...[1,2,3]];
        ({a}) => a;
      `
      const output = babel(code, true, {
        'preset-env': {
          targets: {
            esmodules: true
          }
        },
        // our modern preset is no preset at all
        'experimental-modern-preset': () => ({})
      })

      expect(output).toMatch(trim`
        const[,b,c]=[...[1,2,3]];({a})=>a;
      `)
    })
  })
})
