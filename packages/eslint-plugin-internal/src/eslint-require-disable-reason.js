/**
 * ESLint rule: require-disable-reason
 * Requires a reason on every eslint-disable comment that turns off one of the
 * configured rules, and forbids turning those rules off for a range of lines
 * or a whole file.
 *
 * The reason goes in the comments directly above the disable comment:
 *
 *   // React's Flight client exports this as `any`.
 *   // eslint-disable-next-line @next/internal/no-as-any
 *
 * A trailing `// eslint-disable-line` has no line above it of its own, so it
 * takes the reason after ` -- ` instead, which ESLint also supports:
 *
 *   foo(x as any) // eslint-disable-line @next/internal/no-as-any -- <reason>
 *
 * This is a separate rule from the rules it guards: a report from the guarded
 * rule itself would be hidden by the very comment it complains about.
 *
 * A bare `/* eslint-disable *\/` (no rule list) also turns this rule off for
 * the rest of the file, so it can't be reported here.
 */

// Matches the directive at the start of a comment, the same way ESLint does.
const DIRECTIVE_PATTERN = /^\s*(eslint-disable(?:-next-line|-line)?)(?:\s|$)/u
// ESLint splits the reason off the directive at the first ` -- `.
const REASON_SEPARATOR = /\s-{2,}\s/u
// Comments that are instructions to a tool rather than prose, so they can't
// be the reason for a disable comment below them.
const TOOL_COMMENT_PATTERN = /^\s*(?:eslint|@ts-|prettier-ignore|istanbul|c8)/u
// Words that say nothing about why a rule is disabled. A reason made up only
// of these (e.g. "TODO fix this") is rejected.
const FILLER_WORDS = new Set([
  'a',
  'an',
  'any',
  'as',
  'cast',
  'casting',
  'fix',
  'fixme',
  'for',
  'hack',
  'it',
  'later',
  'me',
  'needed',
  'now',
  'required',
  'temp',
  'temporary',
  'the',
  'this',
  'todo',
  'ts',
  'type',
  'types',
  'typing',
  'workaround',
  'xxx',
])

/**
 * Parses an ESLint disable directive out of a comment.
 * Returns `null` when the comment isn't one.
 */
function parseDisableDirective(comment) {
  const [directivePart, ...reasonParts] = comment.value.split(REASON_SEPARATOR)
  const match = DIRECTIVE_PATTERN.exec(directivePart)
  if (!match) {
    return null
  }

  const kind = match[1]
  // `// eslint-disable` is not a directive; only the block form is.
  if (kind === 'eslint-disable' && comment.type !== 'Block') {
    return null
  }

  const ruleNames = directivePart
    .slice(match[0].length)
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  const inlineReason =
    reasonParts.length > 0 ? reasonParts.join(' -- ').trim() : ''

  return { kind, ruleNames, inlineReason }
}

/**
 * Whether a comment is the only thing on its lines, apart from the `{` and
 * `}` that wrap a comment in JSX, or the `?` or `:` that prettier puts before
 * a comment on a ternary branch.
 */
function isOnOwnLine(comment, lines) {
  const before = lines[comment.loc.start.line - 1].slice(
    0,
    comment.loc.start.column
  )
  const after = lines[comment.loc.end.line - 1].slice(comment.loc.end.column)
  return /^\s*[{?:]?\s*$/u.test(before) && /^\s*\}?\s*$/u.test(after)
}

/**
 * Returns the text of the run of comments directly above `comments[index]`,
 * with no blank line or code in between, or `''` when there are none.
 */
function getReasonAbove(comments, index, lines) {
  const parts = []
  let nextStartLine = comments[index].loc.start.line
  for (let i = index - 1; i >= 0; i--) {
    const comment = comments[i]
    if (
      comment.loc.end.line !== nextStartLine - 1 ||
      !isOnOwnLine(comment, lines) ||
      TOOL_COMMENT_PATTERN.test(comment.value)
    ) {
      break
    }
    parts.unshift(comment.value.trim())
    nextStartLine = comment.loc.start.line
  }
  return parts.join(' ')
}

/**
 * Collects the reason given for a directive: the comments above an
 * `eslint-disable-next-line` that sits on its own line, plus any ` -- ` text.
 */
function getReason(directive, comments, index, lines) {
  const comment = comments[index]
  const reasonAbove =
    directive.kind === 'eslint-disable-next-line' && isOnOwnLine(comment, lines)
      ? getReasonAbove(comments, index, lines)
      : ''
  return [reasonAbove, directive.inlineReason].filter(Boolean).join(' ')
}

/**
 * A directive with no rule list turns off every rule, guarded ones included.
 */
function disablesGuardedRule(ruleNames, guardedRules) {
  return (
    ruleNames.length === 0 || ruleNames.some((name) => guardedRules.has(name))
  )
}

function isVagueReason(reason) {
  const words = reason
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean)
  return words.every((word) => FILLER_WORDS.has(word))
}

/**
 * Returns the message id to report for a directive, or `null` if it's fine.
 */
function getProblem(directive, reason) {
  if (directive.kind === 'eslint-disable') {
    return 'rangeDisable'
  }
  if (reason === '') {
    return 'missingReason'
  }
  if (isVagueReason(reason)) {
    return 'vagueReason'
  }
  return null
}

/**
 * @type {import('eslint').Rule.RuleModule}
 */
module.exports = {
  name: 'require-disable-reason',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require a reason on eslint-disable comments for the configured rules, and only allow disabling them one line at a time.',
      recommended: true,
    },
    schema: [
      {
        type: 'object',
        properties: {
          rules: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true,
          },
        },
        required: ['rules'],
        additionalProperties: false,
      },
    ],
    messages: {
      missingReason:
        'Say why `{{rules}}` is disabled here, in a comment directly above: ' +
        '`// <reason>` followed by `// eslint-disable-next-line {{rules}}`. ' +
        'A trailing `eslint-disable-line` takes the reason after ` -- ` instead.',
      vagueReason:
        'The reason for disabling `{{rules}}` should say why it is needed here, not only that it is a TODO.',
      rangeDisable:
        'Disable `{{rules}}` one line at a time with `eslint-disable-next-line` or `eslint-disable-line`, each with a reason.',
    },
  },

  create(context) {
    const guardedRules = new Set(context.options[0].rules)

    return {
      Program() {
        const { lines } = context.sourceCode
        const comments = context.sourceCode.getAllComments()
        for (const [index, comment] of comments.entries()) {
          const directive = parseDisableDirective(comment)
          if (
            !directive ||
            !disablesGuardedRule(directive.ruleNames, guardedRules)
          ) {
            continue
          }

          const reason = getReason(directive, comments, index, lines)
          const messageId = getProblem(directive, reason)
          if (messageId) {
            const rules =
              directive.ruleNames.length > 0
                ? directive.ruleNames
                    .filter((name) => guardedRules.has(name))
                    .join(', ')
                : [...guardedRules].join(', ')
            context.report({ loc: comment.loc, messageId, data: { rules } })
          }
        }
      },
    }
  },
}
