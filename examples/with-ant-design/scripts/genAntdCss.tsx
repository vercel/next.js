// import React from 'react'
import fs from 'fs'
import { extractStyle } from '@ant-design/static-style-extract'
import withTheme from '../theme'
import { resolve } from 'path'
import { mkdirp } from 'mkdirp'

const outputPath = resolve(__dirname, '../public/antd.min.css')

// 1. default theme

// const css = extractStyle();

// 2. With custom theme

const css = extractStyle(withTheme)

mkdirp(resolve(__dirname, '..', 'public')).then((res) => {
  fs.writeFileSync(outputPath, css)
})

console.log(`🎉 Antd CSS generated at ${outputPath}`)
