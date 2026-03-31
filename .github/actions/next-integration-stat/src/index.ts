import { context, getOctokit } from '@actions/github'
import { info, getInput } from '@actions/core'
const { default: stripAnsi } = require('strip-ansi')
const fs = require('fs')

/// <reference path="./manifest" />

type Octokit = ReturnType<typeof getOctokit>

type Job = Awaited<
  ReturnType<Octokit['rest']['actions']['listJobsForWorkflowRun']>
>['data']['jobs'][number]

// A comment marker to identify the comment created by this action.
const BOT_COMMENT_MARKER = `<!-- __marker__ next.js integration stats __marker__ -->`
// Header for the test report.
const commentTitlePre = `## Failing next.js integration test suites`

// Download logs for a job in a workflow run by reading redirect url from workflow log response.
async function fetchJobLogsFromWorkflow(
  octokit: Octokit,
  job: Job
): Promise<{ logs: string; job: Job }> {
  console.log(
    `fetchJobLogsFromWorkflow ${job.name}: Checking test results for the job`
  )

  // downloadJobLogsForWorkflowRun returns a redirect to the actual logs
  // The returned URL is valid (without any additional auth) for 1 minute
  const jobLogRedirectResponse =
    await octokit.rest.actions.downloadJobLogsForWorkflowRun({
      accept: 'application/vnd.github.v3+json',
      ...context.repo,
      job_id: job.id,
    })

  console.log(
    `fetchJobLogsFromWorkflow ${job.name}: Trying to get logs from redirect url ${jobLogRedirectResponse.url}`
  )

  // fetch the actual logs
  const jobLogsResponse = await fetch(jobLogRedirectResponse.url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
    },
  })

  console.log(
    `fetchJobLogsFromWorkflow ${job.name}: Logs response status ${jobLogsResponse.status}`
  )

  if (!jobLogsResponse.ok) {
    throw new Error(
      `Failed to get logsUrl, got status ${jobLogsResponse.status}`
    )
  }

  // this should be the check_run's raw logs including each line
  // prefixed with a timestamp in format 2020-03-02T18:42:30.8504261Z
  const logText: string = await jobLogsResponse.text()
  const dateTimeStripped = logText
    .split('\n')
    .map((line) => line.substring('2020-03-02T19:39:16.8832288Z '.length))

  const logs = dateTimeStripped.join('\n')

  return { logs, job }
}

// Collect necessary inputs to run actions,
async function getInputs(): Promise<{
  token: string
  octokit: Octokit
  prNumber: number | undefined
  sha: string
  noBaseComparison: boolean
  shouldExpandResultMessages: boolean
}> {
  const token = getInput('token')
  const octokit = getOctokit(token)

  const shouldExpandResultMessages =
    getInput('expand_result_messages') === 'true'

  if (!shouldExpandResultMessages) {
    console.log('Test report comment will not include result messages.')
  }

  const prNumber = context?.payload?.pull_request?.number
  const sha = context?.sha

  // For the daily cron workflow, we don't compare to previous but post daily summary
  const noBaseComparison = prNumber == null

  if (prNumber != null) {
    console.log('Trying to collect integration stats for PR', {
      prNumber,
      sha: sha,
    })

    const comments = await octokit.paginate(octokit.rest.issues.listComments, {
      ...context.repo,
      issue_number: prNumber,
      per_page: 200,
    })

    console.log('Found total comments for PR', comments?.length || 0)

    // Get a comment from the bot if it exists, delete all of them.
    // Due to test report can exceed single comment size limit, it can be multiple comments and sync those is not trivial.
    // Instead, we just delete all of them and post a new one.
    const existingComments = comments?.filter(
      (comment) =>
        comment?.user?.login === 'github-actions[bot]' &&
        comment?.body?.includes(BOT_COMMENT_MARKER)
    )

    if (existingComments?.length) {
      console.log('Found existing comments, deleting them')
      for (const comment of existingComments) {
        await octokit.rest.issues.deleteComment({
          ...context.repo,
          comment_id: comment.id,
        })
      }
    }
  } else {
    info('No PR number found in context, will not try to post comment.')
  }

  const inputs = {
    token,
    octokit,
    prNumber,
    sha,
    noBaseComparison,
    shouldExpandResultMessages,
  }

  console.log('getInputs: these inputs will be used to collect test results', {
    ...inputs,
    token: !!token, // redact this
  })

  return inputs
}

// Iterate all the jobs in the current workflow run, collect & parse logs for failed jobs for the postprocessing.
async function getJobResults(
  octokit: Octokit,
  token: string,
  sha: string
): Promise<TestResultManifest> {
  console.log('Trying to collect next.js integration test logs')
  const jobs = await octokit.paginate(
    octokit.rest.actions.listJobsForWorkflowRun,
    {
      ...context.repo,
      run_id: context?.runId,
      per_page: 50,
    }
  )

  // Filter out next.js integration test jobs
  const integrationTestJobs = jobs?.filter((job) =>
    /Next\.js integration test \([^)]*\) \([^)]*\)/.test(job.name)
  )

  console.log(
    `Logs found for ${integrationTestJobs.length} jobs`,
    integrationTestJobs.map((job) => job.name)
  )

  // Iterate over all of next.js integration test jobs, read logs and collect failed test results if exists.
  const fullJobLogsFromWorkflow = await Promise.all(
    integrationTestJobs.map((job) => fetchJobLogsFromWorkflow(octokit, job))
  )

  console.log('Logs downloaded for all jobs')

  const [jobResults, flakyMonitorJobResults] = fullJobLogsFromWorkflow.reduce(
    (acc, { logs, job }) => {
      const subset = job.name.includes('FLAKY_SUBSET')
      const index = subset ? 1 : 0

      const { id, run_id, run_url, html_url } = job
      console.log('Parsing logs for job', { id, run_id, run_url, html_url })
      const splittedLogs = logs.split('--test output start--')
      // First item isn't test data, it's just the log header
      splittedLogs.shift()
      for (const logLine of splittedLogs) {
        let testData: string | undefined
        try {
          testData = logLine.split('--test output end--')[0].trim()!

          const data = JSON.parse(testData)
          acc[index].push({
            job: job.name,
            data,
          })
        } catch (err) {
          console.log('Failed to parse test results', {
            id,
            run_id,
            run_url,
            html_url,
            testData,
          })
        }
      }

      return acc
    },
    [[], []] as [Array<JobResult>, Array<JobResult>]
  )

  console.log(`Flakyness test subset results`, { flakyMonitorJobResults })

  const testResultManifest: TestResultManifest = {
    ref: sha,
    flakyMonitorJobResults: flakyMonitorJobResults,
    result: jobResults,
  }

  // Collect all test results into single manifest to store into file. This'll allow to upload / compare test results
  // across different runs.
  fs.writeFileSync(
    './nextjs-test-results.json',
    JSON.stringify(testResultManifest, null, 2)
  )

  return testResultManifest
}

// Get the latest base test results to diff against with current test results.
async function getTestResultDiffBase(
  _octokit: Octokit
): Promise<TestResultManifest | null> {
  // TODO: This code was previously written for the `vercel/turborepo`
  // repository which used to have a `nextjs-integration-test-data` branch with
  // all the previous test run data.
  //
  // The last update to that branch is from Dec 2023. If we want to support
  // comparisions with the canary branch, we need to read this data from
  // somewhere else.
  return null
}

function withoutRetries(results: Array<JobResult>): Array<JobResult> {
  results = results.slice().reverse()
  const seenNames = new Set()
  results = results.filter((job) => {
    if (
      job.data.testResults.some((testResult) => seenNames.has(testResult.name))
    ) {
      return false
    }
    job.data.testResults.forEach((testResult) => seenNames.add(testResult.name))
    return true
  })
  return results.reverse()
}

function getTestSummary(
  sha: string,
  baseResults: TestResultManifest | null,
  jobResults: TestResultManifest
) {
  // Read current tests summary
  const {
    currentTestFailedSuiteCount,
    currentTestPassedSuiteCount,
    currentTestTotalSuiteCount,
    currentTestFailedCaseCount,
    currentTestPassedCaseCount,
    currentTestTotalCaseCount,
    currentTestFailedNames,
  } = withoutRetries(jobResults.result).reduce(
    (acc, value) => {
      const { data } = value
      acc.currentTestFailedSuiteCount += data.numFailedTestSuites
      acc.currentTestPassedSuiteCount += data.numPassedTestSuites
      acc.currentTestTotalSuiteCount += data.numTotalTestSuites
      acc.currentTestFailedCaseCount += data.numFailedTests
      acc.currentTestPassedCaseCount += data.numPassedTests
      acc.currentTestTotalCaseCount += data.numTotalTests
      for (const testResult of data.testResults ?? []) {
        if (testResult.status !== 'passed' && testResult.name.length > 2) {
          acc.currentTestFailedNames.push(testResult.name)
        }
      }
      return acc
    },
    {
      currentTestFailedSuiteCount: 0,
      currentTestPassedSuiteCount: 0,
      currentTestTotalSuiteCount: 0,
      currentTestFailedCaseCount: 0,
      currentTestPassedCaseCount: 0,
      currentTestTotalCaseCount: 0,
      currentTestFailedNames: [] as Array<string>,
    }
  )

  console.log(
    'Current test summary',
    JSON.stringify(
      {
        currentTestFailedSuiteCount,
        currentTestPassedSuiteCount,
        currentTestTotalSuiteCount,
        currentTestFailedCaseCount,
        currentTestPassedCaseCount,
        currentTestTotalCaseCount,
        currentTestFailedNames,
      },
      null,
      2
    )
  )

  if (!baseResults) {
    console.log("There's no base to compare")

    return `### Test summary
|   | Current (${sha}) | Diff |
|---|---|---|
| Failed Suites | ${currentTestFailedSuiteCount} | N/A |
| Failed Cases | ${currentTestFailedCaseCount} | N/A |`
  }

  const {
    baseTestFailedSuiteCount,
    baseTestPassedSuiteCount,
    baseTestTotalSuiteCount,
    baseTestFailedCaseCount,
    baseTestPassedCaseCount,
    baseTestTotalCaseCount,
    baseTestFailedNames,
  } = withoutRetries(baseResults.result).reduce(
    (acc, value) => {
      const { data } = value
      acc.baseTestFailedSuiteCount += data.numFailedTestSuites
      acc.baseTestPassedSuiteCount += data.numPassedTestSuites
      acc.baseTestTotalSuiteCount += data.numTotalTestSuites
      acc.baseTestFailedCaseCount += data.numFailedTests
      acc.baseTestPassedCaseCount += data.numPassedTests
      acc.baseTestTotalCaseCount += data.numTotalTests
      for (const testResult of data.testResults ?? []) {
        if (testResult.status !== 'passed' && testResult.name.length > 2) {
          acc.baseTestFailedNames.push(testResult.name)
        }
      }
      return acc
    },
    {
      baseTestFailedSuiteCount: 0,
      baseTestPassedSuiteCount: 0,
      baseTestTotalSuiteCount: 0,
      baseTestFailedCaseCount: 0,
      baseTestPassedCaseCount: 0,
      baseTestTotalCaseCount: 0,
      baseTestFailedNames: [] as Array<string>,
    }
  )

  console.log(
    'Base test summary',
    JSON.stringify(
      {
        baseTestFailedSuiteCount,
        baseTestPassedSuiteCount,
        baseTestTotalSuiteCount,
        baseTestFailedCaseCount,
        baseTestPassedCaseCount,
        baseTestTotalCaseCount,
        baseTestFailedNames,
      },
      null,
      2
    )
  )

  let testSuiteDiff = ':zero:'
  const suiteCountDiff = baseTestFailedSuiteCount - currentTestFailedSuiteCount
  if (suiteCountDiff > 0) {
    testSuiteDiff = `:arrow_down_small: ${suiteCountDiff}`
  } else if (suiteCountDiff < 0) {
    testSuiteDiff = `:arrow_up_small: ${-suiteCountDiff}`
  }

  let testCaseDiff = ':zero:'
  const caseCountDiff = baseTestFailedCaseCount - currentTestFailedCaseCount
  if (caseCountDiff > 0) {
    testCaseDiff = `:arrow_down_small: ${caseCountDiff}`
  } else if (caseCountDiff < 0) {
    testCaseDiff = `:arrow_up_small: ${-caseCountDiff}`
  }

  // Append summary test report to the comment body
  let ret = `### Test summary
|   | ${`canary (${baseResults.ref}`} | Current (${sha}) | Diff (Failed) |
|---|---|---|---|
| Test suites | :red_circle: ${baseTestFailedSuiteCount} / :green_circle: ${baseTestPassedSuiteCount} (Total: ${baseTestTotalSuiteCount}) | :red_circle: ${currentTestFailedSuiteCount} / :green_circle: ${currentTestPassedSuiteCount} (Total: ${currentTestTotalSuiteCount}) | ${testSuiteDiff} |
| Test cases | :red_circle: ${baseTestFailedCaseCount} / :green_circle: ${baseTestPassedCaseCount} (Total: ${baseTestTotalCaseCount}) | :red_circle: ${currentTestFailedCaseCount} / :green_circle: ${currentTestPassedCaseCount} (Total: ${currentTestTotalCaseCount}) | ${testCaseDiff} |

`

  const fixedTests = baseTestFailedNames.filter(
    (name) => !currentTestFailedNames.includes(name)
  )
  const newFailedTests = currentTestFailedNames.filter(
    (name) => !baseTestFailedNames.includes(name)
  )

  /*
  //NOTE: upstream test can be flaky, so this can appear intermittently
  //even if there aren't actual fix. To avoid confusion, do not display this
  //for now.
  if (fixedTests.length > 0) {
    ret += `\n:white_check_mark: **Fixed tests:**\n\n${fixedTests
      .map((t) => (t.length > 5 ? `\t- ${t}` : t))
      .join(" \n")}`;
  }*/

  if (newFailedTests.length > 0) {
    ret += `\n:x: **Newly failed tests:**\n\n${newFailedTests
      .map((t) => (t.length > 5 ? `\t- ${t}` : t))
      .join(' \n')}`
  }

  console.log('Newly failed tests', JSON.stringify(newFailedTests, null, 2))
  console.log('Fixed tests', JSON.stringify(fixedTests, null, 2))

  return ret
}

// Create a markdown formatted comment body for the PR
// with marker prefix to look for existing comment for the subsequent runs.
const createFormattedComment = (comment: {
  header: Array<string>
  contents: Array<string>
}) => {
  return (
    [
      `${commentTitlePre} ${BOT_COMMENT_MARKER}`,
      ...(comment.header ?? []),
    ].join(`\n`) +
    `\n\n` +
    comment.contents.join(`\n`)
  )
}

// Higher order fn to create a function that creates a comment on a PR
const createCommentPostAsync =
  (octokit: Octokit, prNumber?: number) => async (body: string) => {
    if (!prNumber) {
      console.log(
        "This workflow run doesn't seem to be triggered via PR, there's no corresponding PR number. Skipping creating a comment."
      )
      return
    }

    const result = await octokit.rest.issues.createComment({
      ...context.repo,
      issue_number: prNumber,
      body,
    })

    console.log('Created a new comment', result.data.html_url)
  }

// An action report failed next.js integration test with --turbopack
async function run() {
  const {
    token,
    octokit,
    prNumber,
    sha,
    noBaseComparison,
    shouldExpandResultMessages,
  } = await getInputs()

  // Collect current PR's failed test results
  const jobResults = await getJobResults(octokit, token, sha)

  // Get the base to compare against
  const baseResults = noBaseComparison
    ? null
    : await getTestResultDiffBase(octokit)

  const postCommentAsync = createCommentPostAsync(octokit, prNumber)

  const failedTestLists = []
  const passedTestsLists = []
  // Collect failed test results for each job. We don't use this actively yet.
  const perJobFailedLists = {}

  // Consturct a comment body to post test report with summary & full details.
  const comments = jobResults.result.reduce((acc, value, _idx) => {
    const { data: testData } = value

    const commentValues = []
    // each job have nested array of test results
    // Fill in each individual test suite failures
    const groupedFails = {}
    let resultMessage = ''
    for (const testResult of testData.testResults ?? []) {
      resultMessage += stripAnsi(testResult?.message)
      resultMessage += '\n\n'
      const failedAssertions = testResult?.assertionResults?.filter(
        (res) => res.status === 'failed'
      )

      for (const fail of failedAssertions ?? []) {
        const ancestorKey = fail?.ancestorTitles?.join(' > ')!

        if (!groupedFails[ancestorKey]) {
          groupedFails[ancestorKey] = []
        }
        groupedFails[ancestorKey].push(fail)
      }
    }

    let hasFailedTest = false
    for (const test of testData.testResults ?? []) {
      if (test.status !== 'passed') {
        const failedTest = test.name
        if (!failedTestLists.includes(failedTest)) {
          commentValues.push(`\`${failedTest}\``)
          failedTestLists.push(failedTest)

          if (!perJobFailedLists[value.job]) {
            perJobFailedLists[value.job] = []
          }
          perJobFailedLists[value.job].push(failedTest)
        }
      } else {
        passedTestsLists.push(test.name)
      }
    }
    if (hasFailedTest) commentValues.push(`\n`)

    // Currently there are too many test failures to post since it creates several comments.
    // Only expands if explicitly requested in the option.
    if (shouldExpandResultMessages) {
      for (const group of Object.keys(groupedFails).sort()) {
        const fails = groupedFails[group]
        commentValues.push(`\n`)
        fails.forEach((fail) => {
          commentValues.push(`- ${group} > ${fail.title}`)
        })
      }

      resultMessage = resultMessage.trim()
      const strippedResultMessage =
        resultMessage.length >= 50000
          ? resultMessage.substring(0, 50000) +
            `...\n(Test result messages are too long, cannot post full message in comment. See the action logs for the full message.)`
          : resultMessage
      if (resultMessage.length >= 50000) {
        console.log(
          'Test result messages are too long, comment will post stripped.'
        )
      }

      commentValues.push(`<details>`)
      commentValues.push(`<summary>Expand output</summary>`)
      commentValues.push(strippedResultMessage)
      commentValues.push(`</details>`)
      commentValues.push(`\n`)
    }

    // Check last comment body's length, append or either create new comment depends on the length of the text.
    const commentIdxToUpdate = acc.length - 1
    if (
      acc.length === 0 ||
      commentValues.join(`\n`).length +
        acc[commentIdxToUpdate].contents.join(`\n`).length >
        60000
    ) {
      acc.push({
        header: [`Commit: ${sha}`],
        contents: commentValues,
      })
    } else {
      acc[commentIdxToUpdate].contents.push(...commentValues)
    }
    return acc
  }, [])

  const commentsWithSummary = [
    // First comment is always a summary
    {
      header: [`Commit: ${sha}`],
      contents: [
        getTestSummary(sha, noBaseComparison ? null : baseResults, jobResults),
      ],
    },
    ...comments,
  ]
  const isMultipleComments = comments.length > 1

  try {
    // Store the list of failed test paths to a file
    fs.writeFileSync(
      './failed-test-path-list.json',
      JSON.stringify(
        failedTestLists.filter((x) => x.length > 5),
        null,
        2
      )
    )

    fs.writeFileSync(
      './passed-test-path-list.json',
      JSON.stringify(passedTestsLists, null, 2)
    )

    if (!prNumber) {
      return
    }

    if (jobResults.result.length === 0) {
      console.log('No failed test results found :tada:')
      await postCommentAsync(
        `### Next.js test passes :green_circle: ${BOT_COMMENT_MARKER}` +
          `\nCommit: ${sha}\n`
      )
      return
    }

    for (const [idx, comment] of commentsWithSummary.entries()) {
      const value = {
        ...comment,
      }
      if (isMultipleComments) {
        value.header.push(
          `**(Report ${idx + 1}/${commentsWithSummary.length})**`
        )
      }
      // Add collapsible details for full test report
      if (idx > 0) {
        value.contents = [
          `<details>`,
          `<summary>Expand full test reports</summary>`,
          `\n`,
          ...value.contents,
          `</details>`,
        ]
      }
      const commentBodyText = createFormattedComment(value)
      await postCommentAsync(commentBodyText)
    }
  } catch (error) {
    console.error('Failed to post comment', error)

    // Comment update should succeed, otherwise let CI fails
    throw error
  }
}

run()
