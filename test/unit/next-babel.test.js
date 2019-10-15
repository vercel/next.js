/* global fixture, test */
import 'testcafe'
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

fixture('next/babel')

test('should transform JSX to use a local identifier in modern mode', async t => {
  const output = babel(`const a = () => <a href="/">home</a>;`, true)

  // it should add a React import:
  await t.expect(output).contains(`import React from"react"`)
  // it should hoist JSX factory to a module level variable:
  await t.expect(output).contains(`var __jsx=React.createElement`)
  // it should use that factory for all JSX:
  await t.expect(output).contains(`__jsx("a",{href:"/"`)

  await t
    .expect(babel(`const a = ()=><a href="/">home</a>`, true))
    .eql(
      `import React from"react";var __jsx=React.createElement;var a=function a(){return __jsx("a",{href:"/"},"home");};`
    )
})

test('should transform JSX to use a local identifier in CommonJS mode', async t => {
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

  await t.expect(output).contains(`var ${reactNamespace}=`)
  await t.expect(output).contains(`require("react")`)
  await t.expect(output).contains(`var __jsx=${react}.createElement`)
  // Fragment should use the same React namespace import:
  await t.expect(output).contains(`__jsx(${react}.Fragment`)
  await t.expect(output).contains(`__jsx("a",{href:"/"`)

  await t
    .expect(babel(`const a = ()=><a href="/">home</a>`))
    .eql(
      `"use strict";var _interopRequireDefault=require("@babel/runtime-corejs2/helpers/interopRequireDefault");var _react=_interopRequireDefault(require("react"));var __jsx=_react["default"].createElement;var a=function a(){return __jsx("a",{href:"/"},"home");};`
    )
})

test('should support Fragment syntax', async t => {
  const output = babel(`const a = () => <>hello</>;`, true)

  await t.expect(output).contains(`React.Fragment`)

  await t
    .expect(babel(`const a = () => <>hello</>;`, true))
    .eql(
      `import React from"react";var __jsx=React.createElement;var a=function a(){return __jsx(React.Fragment,null,"hello");};`
    )
})

test('should support commonjs', async t => {
  const output = babel(
    trim`
    const React = require('react');
    module.exports = () => <div>test2</div>;
  `,
    true
  )

  await t
    .expect(output)
    .eql(
      `var React=require('react');var __jsx=React.createElement;module.exports=function(){return __jsx("div",null,"test2");};`
    )
})

test('should transform Array-destructured hook return values use object destructuring', async t => {
  const output = babel(
    trim`
    import { useState } from 'react';
    const [count, setCount] = useState(0);
  `,
    true
  )

  await t.expect(output).contains(trim`
    var _useState=useState(0),count=_useState[0],setCount=_useState[1];
  `)

  await t
    .expect(output)
    .eql(
      `import{useState}from'react';var _useState=useState(0),count=_useState[0],setCount=_useState[1];`
    )
})

test('should be able to ignore some Array-destructured hook return values', async t => {
  const output = babel(
    trim`
    import { useState } from 'react';
    const [, setCount] = useState(0);
  `,
    true
  )

  await t.expect(output).contains(trim`
    var _useState=useState(0),setCount=_useState[1];
  `)

  await t
    .expect(output)
    .eql(
      `import{useState}from'react';var _useState=useState(0),setCount=_useState[1];`
    )
})

test('should allow passing a custom Babel preset', async t => {
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

  await t.expect(output).contains(trim`
    const[,b,c]=[...[1,2,3]];({a})=>a;
  `)
})
