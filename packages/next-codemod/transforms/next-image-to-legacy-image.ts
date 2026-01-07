import type { API, FileInfo, Options } from 'jscodeshift'
import { createParserFromPath } from '../lib/parser'

export default function transformer(
  file: FileInfo,
  _api: API,
  options: Options
) {
  const j = createParserFromPath(file.path)
  const root = j(file.source)

  // Before: import Image from "next/image"
  //  After: import Image from "next/legacy/image"
  root
    .find(j.ImportDeclaration, {
      source: { value: 'next/image' },
    })
    .forEach((imageImport) => {
      imageImport.node.source = j.stringLiteral('next/legacy/image')
    })
  // Before: const Image = await import("next/image")
  //  After: const Image = await import("next/legacy/image")
  root.find(j.AwaitExpression).forEach((awaitExp) => {
    const arg = awaitExp.value.argument
    if (arg?.type === 'CallExpression' && arg.callee.type === 'Import') {
      if (
        arg.arguments[0].type === 'StringLiteral' &&
        arg.arguments[0].value === 'next/image'
      ) {
        arg.arguments[0] = j.stringLiteral('next/legacy/image')
      }
    }
  })

  // Before: import Image from "next/future/image"
  //  After: import Image from "next/image"
  root
    .find(j.ImportDeclaration, {
      source: { value: 'next/future/image' },
    })
    .forEach((imageFutureImport) => {
      imageFutureImport.node.source = j.stringLiteral('next/image')
    })

  // Before: const Image = await import("next/future/image")
  //  After: const Image = await import("next/image")
  root.find(j.AwaitExpression).forEach((awaitExp) => {
    const arg = awaitExp.value.argument
    if (arg?.type === 'CallExpression' && arg.callee.type === 'Import') {
      if (
        arg.arguments[0].type === 'StringLiteral' &&
        arg.arguments[0].value === 'next/future/image'
      ) {
        arg.arguments[0] = j.stringLiteral('next/image')
      }
    }
  })

  // Before: const Image = require("next/image")
  //  After: const Image = require("next/legacy/image")
  root.find(j.CallExpression).forEach((requireExp) => {
    if (
      requireExp?.value?.callee?.type === 'Identifier' &&
      requireExp.value.callee.name === 'require'
    ) {
      let firstArg = requireExp.value.arguments[0]
      if (
        firstArg &&
        firstArg.type === 'StringLiteral' &&
        firstArg.value === 'next/image'
      ) {
        requireExp.value.arguments[0] = j.stringLiteral('next/legacy/image')
      }
    }
  })

  // Before: const Image = require("next/future/image")
  //  After: const Image = require("next/image")
  root.find(j.CallExpression).forEach((requireExp) => {
    if (
      requireExp?.value?.callee?.type === 'Identifier' &&
      requireExp.value.callee.name === 'require'
    ) {
      let firstArg = requireExp.value.arguments[0]
      if (
        firstArg &&
        firstArg.type === 'StringLiteral' &&
        firstArg.value === 'next/future/image'
      ) {
        requireExp.value.arguments[0] = j.stringLiteral('next/image')
      }
    }
  })

  // Learn more about renaming an import declaration here:
  // https://www.codeshiftcommunity.com/docs/import-manipulation/#replacerename-an-import-declaration

  return root.toSource(options)
}
