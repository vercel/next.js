import type { API, FileInfo, Options } from 'jscodeshift'

export default function transformer(
  file: FileInfo,
  api: API,
  options: Options
) {
  const j = api.jscodeshift
  const root = j(file.source)

  // Before: import Image from "next/image"
  //  After: import Image from "next/legacy/image"
  root
    .find(j.ImportDeclaration, {
      source: { value: 'next/image' },
    })
    .forEach((imageImport) => {
      j(imageImport).replaceWith(
        j.importDeclaration(
          imageImport.node.specifiers,
          j.stringLiteral('next/legacy/image')
        )
      )
    })
  // Before: const Image = await import("next/image")
  //  After: const Image = await import("next/legacy/image")
  root
    .find(j.ImportExpression, {
      source: { value: 'next/image' },
    })
    .forEach((imageImport) => {
      j(imageImport).replaceWith(
        j.importExpression(j.stringLiteral('next/legacy/image'))
      )
    })

  // Before: import Image from "next/future/image"
  //  After: import Image from "next/image"
  root
    .find(j.ImportDeclaration, {
      source: { value: 'next/future/image' },
    })
    .forEach((imageFutureImport) => {
      j(imageFutureImport).replaceWith(
        j.importDeclaration(
          imageFutureImport.node.specifiers,
          j.stringLiteral('next/image')
        )
      )
    })

  // Before: const Image = await import("next/future/image")
  //  After: const Image = await import("next/image")
  root
    .find(j.ImportExpression, {
      source: { value: 'next/future/image' },
    })
    .forEach((imageFutureImport) => {
      j(imageFutureImport).replaceWith(
        j.importExpression(j.stringLiteral('next/image'))
      )
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
        firstArg.type === 'Literal' &&
        firstArg.value === 'next/image'
      ) {
        requireExp.value.arguments[0] = j.literal('next/legacy/image')
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
        firstArg.type === 'Literal' &&
        firstArg.value === 'next/future/image'
      ) {
        requireExp.value.arguments[0] = j.literal('next/image')
      }
    }
  })

  // Learn more about renaming an import declaration here:
  // https://www.codeshiftcommunity.com/docs/import-manipulation/#replacerename-an-import-declaration

  return root.toSource(options)
}
