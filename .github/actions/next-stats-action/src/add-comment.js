const path = require('path')
const fs = require('fs').promises
const fetch = require('node-fetch')
const prettyMs = require('pretty-ms')
const logger = require('./util/logger')
const prettyBytes = require('pretty-bytes')
const { benchTitle } = require('./constants')

const gzipIgnoreRegex = new RegExp(`(General|^Serverless|${benchTitle})`)

const prettify = (val, type = 'bytes') => {
  if (typeof val !== 'number') return 'N/A'
  return type === 'bytes' ? prettyBytes(val) : prettyMs(val)
}

const round = (num, places) => {
  const placesFactor = Math.pow(10, places)
  return Math.round(num * placesFactor) / placesFactor
}

const shortenLabel = (itemKey) =>
  itemKey.length > 24
    ? `${itemKey.slice(0, 12)}..${itemKey.slice(-12)}`
    : itemKey

const twoMB = 2 * 1024 * 1024
const ONE_HUNDRED_BYTES = 100
const ONE_HUNDRED_MS = 100

module.exports = async function addComment(
  results = [],
  actionInfo,
  statsConfig
) {
  let comment = `# ${
    actionInfo.isRelease
      ? statsConfig.commentReleaseHeading || 'Stats from current release'
      : statsConfig.commentHeading || 'Stats from current PR'
  }\n\n`

  const tableHead = `|  | ${statsConfig.mainRepo} ${statsConfig.mainBranch} ${
    actionInfo.lastStableTag || ''
  } | ${actionInfo.prRepo} ${actionInfo.prRef} | Change |\n| - | - | - | - |\n`

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const isLastResult = i === results.length - 1
    let resultHasIncrease = false
    let resultHasDecrease = false
    let resultContent = ''

    Object.keys(result.mainRepoStats).forEach((groupKey) => {
      const isBenchmark = groupKey === benchTitle
      const mainRepoGroup = result.mainRepoStats[groupKey]
      const diffRepoGroup = result.diffRepoStats[groupKey]
      const itemKeys = new Set([
        ...Object.keys(mainRepoGroup),
        ...Object.keys(diffRepoGroup),
      ])
      let groupTable = tableHead
      let mainRepoTotal = 0
      let diffRepoTotal = 0
      let totalChange = 0

      itemKeys.forEach((itemKey) => {
        const prettyType = itemKey.match(/(length|duration)/i) ? 'ms' : 'bytes'
        const isGzipItem = itemKey.endsWith('gzip')
        const mainItemVal = mainRepoGroup[itemKey]
        const diffItemVal = diffRepoGroup[itemKey]
        const useRawValue = isBenchmark && prettyType !== 'ms'
        const mainItemStr = useRawValue
          ? mainItemVal
          : prettify(mainItemVal, prettyType)

        const diffItemStr = useRawValue
          ? diffItemVal
          : prettify(diffItemVal, prettyType)

        let change = '✓'

        // Don't show gzip values for serverless as they aren't
        // deterministic currently
        if (groupKey.startsWith('Serverless') && isGzipItem) return
        // otherwise only show gzip values
        else if (!isGzipItem && !groupKey.match(gzipIgnoreRegex)) return

        // calculate the change
        if (mainItemVal !== diffItemVal) {
          if (
            typeof mainItemVal === 'number' &&
            typeof diffItemVal === 'number'
          ) {
            const roundedValue = round(diffItemVal - mainItemVal, 2)

            // check if there is still a change after rounding
            if (
              roundedValue !== 0 &&
              ((prettyType === 'ms' && roundedValue > ONE_HUNDRED_MS) ||
                (prettyType === 'bytes' && roundedValue > ONE_HUNDRED_BYTES))
            ) {
              change = roundedValue
              const absChange = Math.abs(change)
              const warnIfNegative = isBenchmark && itemKey.match(/req\/sec/)
              const warn = warnIfNegative
                ? change < 0
                  ? '⚠️ '
                  : ''
                : change > 0
                ? '⚠️ '
                : ''
              change = `${warn}${change < 0 ? '-' : '+'}${
                useRawValue ? absChange : prettify(absChange, prettyType)
              }`
            } else {
              change = 'N/A'
            }
          } else {
            change = 'N/A'
          }
        }

        if (
          (change !== 'N/A' && !itemKey.startsWith('buildDuration')) ||
          (isBenchmark && itemKey.match(/req\/sec/))
        ) {
          if (typeof mainItemVal === 'number') mainRepoTotal += mainItemVal
          if (typeof diffItemVal === 'number') diffRepoTotal += diffItemVal
        }

        groupTable += `| ${
          isBenchmark ? itemKey : shortenLabel(itemKey)
        } | ${mainItemStr} | ${diffItemStr} | ${change} |\n`
      })
      let groupTotalChange = ''

      totalChange = diffRepoTotal - mainRepoTotal

      if (totalChange !== 0) {
        if (totalChange < 0) {
          resultHasDecrease = true
          groupTotalChange = ` Overall decrease ${isBenchmark ? '⚠️' : '✓'}`
        } else {
          if (
            (groupKey !== 'General' && totalChange > 5) ||
            totalChange > twoMB
          ) {
            resultHasIncrease = true
          }
          groupTotalChange = ` Overall increase ${isBenchmark ? '✓' : '⚠️'}`
        }
      }

      if (groupKey !== 'General' && groupKey !== benchTitle) {
        let totalChangeSign = ''

        if (totalChange === 0) {
          totalChange = '✓'
        } else {
          totalChangeSign = totalChange < 0 ? '-' : '⚠️ +'
        }
        totalChange = `${totalChangeSign}${
          typeof totalChange === 'number'
            ? prettify(Math.abs(totalChange))
            : totalChange
        }`
        groupTable += `| Overall change | ${prettyBytes(
          round(mainRepoTotal, 2)
        )} | ${prettyBytes(round(diffRepoTotal, 2))} | ${totalChange} |\n`
      }

      if (itemKeys.size > 0) {
        resultContent += `<details>\n`
        resultContent += `<summary><strong>${groupKey}</strong>${groupTotalChange}</summary>\n\n`
        resultContent += groupTable
        resultContent += `\n</details>\n\n`
      }
    })

    // add diffs
    if (result.diffs) {
      let diffContent = ''

      Object.keys(result.diffs).forEach((itemKey) => {
        const curDiff = result.diffs[itemKey]
        diffContent += `<details>\n`
        diffContent += `<summary>Diff for <strong>${shortenLabel(
          itemKey
        )}</strong></summary>\n\n`

        if (curDiff.length > 36 * 1000) {
          diffContent += 'Diff too large to display'
        } else {
          diffContent += `\`\`\`diff\n${curDiff}\n\`\`\``
        }
        diffContent += `\n</details>\n`
      })

      if (diffContent.length > 0) {
        resultContent += `<details>\n`
        resultContent += `<summary><strong>Diff details</strong></summary>\n\n`
        resultContent += diffContent
        resultContent += `\n</details>\n\n`
      }
    }
    let increaseDecreaseNote = ''

    if (resultHasIncrease) {
      increaseDecreaseNote = ' (Increase detected ⚠️)'
    } else if (resultHasDecrease) {
      increaseDecreaseNote = ' (Decrease detected ✓)'
    }

    comment += `<details open>\n`
    comment += `<summary><strong>${result.title}</strong>${increaseDecreaseNote}</summary>\n\n<br/>\n\n`
    comment += resultContent
    comment += '</details>\n'

    if (!isLastResult) {
      comment += `<hr/>\n`
    }
  }
  if (process.env.LOCAL_STATS) {
    const statsPath = path.resolve('pr-stats.md')
    await fs.writeFile(statsPath, comment)
    console.log(`Output PR stats to ${statsPath}`)
  } else {
    logger('\n--stats start--\n', comment, '\n--stats end--\n')
  }

  if (
    actionInfo.customCommentEndpoint ||
    (actionInfo.githubToken && actionInfo.commentEndpoint)
  ) {
    logger(`Posting results to ${actionInfo.commentEndpoint}`)

    const body = {
      body: comment,
      ...(!actionInfo.githubToken
        ? {
            isRelease: actionInfo.isRelease,
            commitId: actionInfo.commitId,
            issueId: actionInfo.issueId,
          }
        : {}),
    }

    if (actionInfo.customCommentEndpoint) {
      logger(`Using body ${JSON.stringify({ ...body, body: 'OMITTED' })}`)
    }

    try {
      const res = await fetch(actionInfo.commentEndpoint, {
        method: 'POST',
        headers: {
          ...(actionInfo.githubToken
            ? {
                Authorization: `bearer ${actionInfo.githubToken}`,
              }
            : {
                'content-type': 'application/json',
              }),
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        logger.error(`Failed to post results ${res.status}`)
        try {
          logger.error(await res.text())
        } catch (_) {
          /* no-op */
        }
      } else {
        logger('Successfully posted results')
      }
    } catch (err) {
      logger.error(`Error occurred posting results`, err)
    }
  } else {
    logger(
      `Not posting results`,
      actionInfo.githubToken ? 'No comment endpoint' : 'no GitHub token'
    )
  }
}
