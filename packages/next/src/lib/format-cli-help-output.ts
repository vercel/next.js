import { Command, Help } from 'commander'
import { bold } from '../lib/picocolors'

const formatCliHelpOutput = (cmd: Command, helper: Help) => {
  const termWidth = helper.padWidth(cmd, helper)
  const helpWidth = helper.helpWidth || 80
  const itemIndentWidth = 2
  const itemSeparatorWidth = 2 // between term and description

  function formatItem(term: string, description: string) {
    if (description) {
      const fullText = `${term.padEnd(
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
  const commandList = helper.visibleCommands(cmd).map((cmd) => {
    return formatItem(
      helper.subcommandTerm(cmd),
      helper.subcommandDescription(cmd)
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
