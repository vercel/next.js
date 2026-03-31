import type { Command, Help } from 'next/dist/compiled/commander'
import { bold } from '../lib/picocolors'

// Copy-pasted from Commander's Help class -> formatHelp().
// TL;DR, we're overriding the built-in help to add a few niceties.
// Link: https://github.com/tj/commander.js/blob/master/lib/help.js
const formatCliHelpOutput = (cmd: Command, helper: Help) => {
  const termWidth = helper.padWidth(cmd, helper)
  const helpWidth = helper.helpWidth || 80
  const itemIndentWidth = 2
  const itemSeparatorWidth = 2 // between term and description

  function formatItem(term: string, description: string) {
    let value = term

    if (description) {
      if (term === 'directory') {
        value = `[${term}]`
      }

      const fullText = `${value.padEnd(
        termWidth + itemSeparatorWidth
      )}${description}`

      return helper.wrap(
        fullText,
        helpWidth - itemIndentWidth,
        termWidth + itemSeparatorWidth
      )
    }

    return term
  }

  function formatList(textArray: string[]) {
    return textArray.join('\n').replace(/^/gm, ' '.repeat(itemIndentWidth))
  }

  // Usage
  let output = [`${bold('Usage:')} ${helper.commandUsage(cmd)}`, '']

  // Description
  const commandDescription = helper.commandDescription(cmd)

  if (commandDescription.length > 0) {
    output = output.concat([helper.wrap(commandDescription, helpWidth, 0), ''])
  }

  // Arguments
  const argumentList = helper.visibleArguments(cmd).map((argument) => {
    return formatItem(
      helper.argumentTerm(argument),
      helper.argumentDescription(argument)
    )
  })

  if (argumentList.length > 0) {
    output = output.concat([
      `${bold('Arguments:')}`,
      formatList(argumentList),
      '',
    ])
  }

  // Options
  const optionList = helper.visibleOptions(cmd).map((option) => {
    return formatItem(
      helper.optionTerm(option),
      helper.optionDescription(option)
    )
  })

  if (optionList.length > 0) {
    output = output.concat([`${bold('Options:')}`, formatList(optionList), ''])
  }

  // Commands
  const commandList = helper.visibleCommands(cmd).map((subCmd) => {
    return formatItem(
      helper.subcommandTerm(subCmd),
      helper.subcommandDescription(subCmd)
    )
  })

  if (commandList.length > 0) {
    output = output.concat([
      `${bold('Commands:')}`,
      formatList(commandList),
      '',
    ])
  }

  return output.join('\n')
}

export { formatCliHelpOutput }
