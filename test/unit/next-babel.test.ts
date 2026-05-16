/* eslint-env jest */
import { transformSync } from '@babel/core'

const trim = (s) => s.join('\n').trim().replace(/^\s+/gm, '')

const babel = (code, esm = false, presetOptions = {}, filename = 'noop.js') =>
  transformSync(code, {
    filename,
    presets: [[require('next/dist/build/babel/preset'), presetOptions]],
    babelrc: false,
    configFile: false,
    sourceType: 'module',
    compact: true,
    caller: {
      name: 'tests',
      supportsStaticESM: esm,
      isDev: false,
    },
  } as any).code

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
        `"import React from"react";var __jsx=React.createElement;var a=function a(){return __jsx("a",{href:"/"},"home");};"`
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
        `""use strict";var _interopRequireDefault=require("@babel/runtime/helpers/interopRequireDefault");var _react=_interopRequireDefault(require("react"));var __jsx=_react["default"].createElement;var a=function a(){return __jsx("a",{href:"/"},"home");};"`
      )
    })

    it('should support Fragment syntax', () => {
      const output = babel(`const a = () => <>hello</>;`, true)

      expect(output).toMatch(`React.Fragment`)

      expect(babel(`const a = () => <>hello</>;`, true)).toMatchInlineSnapshot(
        `"import React from"react";var __jsx=React.createElement;var a=function a(){return __jsx(React.Fragment,null,"hello");};"`
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
        `"var React=require('react');var __jsx=React.createElement;module.exports=function(){return __jsx("div",null,"test2");};"`
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

  describe('@babel/preset-typescript', () => {
    describe('should allow passing options', () => {
      const code = trim`
        import { Tesla } from "./tesla";
        import { Car } from "./car";

        const benediktsDreamCar: Car = new Tesla();
      `

      function compileMyCar(options) {
        return babel(
          code,
          false,
          {
            'preset-typescript': options,
          },
          'my-car.ts'
        )
      }

      describe('when setting { onlyRemoveTypeImports: true }', () => {
        it('should not elide import', () => {
          const output = compileMyCar({ onlyRemoveTypeImports: true })

          expect(output).toContain('require("./car")')
        })
      })

      describe('when setting { onlyRemoveTypeImports: false }', () => {
        it('should elide import', () => {
          const output = compileMyCar({ onlyRemoveTypeImports: false })

          expect(output).not.toContain('require("./car")')
        })
      })
    })
  })

  describe('respect preset-react runtime', () => {
    it('should allow forcing on automatic mode', () => {
      const code = trim`const a = ()=><a href="/">home</a>`
      const output = babel(code, true, {
        'preset-react': {
          runtime: 'automatic',
        },
      })

      expect(output).toMatchInlineSnapshot(
        `"import{jsx as _jsx}from"react/jsx-runtime";var a=function a(){return/*#__PURE__*/_jsx("a",{href:"/",children:"home"});};"`
      )
    })

    it('should allow forcing on classic mode', () => {
      const code = trim`const a = ()=><a href="/">home</a>`
      const output = babel(code, true, {
        'preset-react': {
          runtime: 'classic',
        },
      })

      expect(output).toMatchInlineSnapshot(
        `"import React from"react";var __jsx=React.createElement;var a=function a(){return __jsx("a",{href:"/"},"home");};"`
      )
    })
  })
})
