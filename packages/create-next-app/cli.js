#! /usr/bin/env node

const chalk = require('chalk')
const program = require('commander')
const lib = require('.')
const pkg = require('./package.json')

const messages = lib.messages
const createNextApp = lib.createNextApp

let projectName

program
  .version(pkg.version)
  .arguments('<project-directory>')
  .usage(`${chalk.green('<project-directory>')} [options]`)
  .action(function (name) {
    projectName = name
  })
  .option('-e, --example <example-path>', messages.exampleHelp())
  .allowUnknownOption()
  .on('--help', messages.help)
  .parse(process.argv)

const example = program.example

createNextApp({
  projectName,
  example
})
