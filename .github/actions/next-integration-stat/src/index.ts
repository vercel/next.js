import { context, getOctokit } from '@actions/github'
import { info, getInput } from '@actions/core'
const { default: stripAnsi } = require('strip-ansi')
const fs = require('fs')
const path = require('path')
const semver = require('semver')

/// <reference path="./manifest" />

type Octokit = ReturnType<typeof getOctokit>

type Job = Awaited<
  ReturnType<Octokit['rest']['actions']['listJobsForWorkflowRun']>
>['data']['jobs'][number]

// A comment marker to identify the comment created by this action.
const BOT_COMMENT_MARKER = `<!-- __marker__ next.js integration stats __marker__ -->`
// Header for the test report.
const commentTitlePre = `## Failing next.js integration test suites`

async function findNextJsVersionFromBuildLogs(
  octokit: Octokit,
  token: string,
  job: Job
): Promise<string> {
  console.log(
    'findNextJsVersionFromBuildLogs: Checking logs for the job ',
    job.name
  )

  // downloadJobLogsForWorkflowRun returns a redirect to the actual logs
  const jobLogRedirectResponse =
    await octokit.rest.actions.downloadJobLogsForWorkflowRun({
      accept: 'application/vnd.github+json',
      ...context.repo,
      job_id: job.id,
    })

  console.log(
    'findNextJsVersionFromBuildLogs: Trying to get logs from redirect url ',
    jobLogRedirectResponse.url
  )

  // fetch the actual logs
  const jobLogsResponse = await fetch(jobLogRedirectResponse.url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      // [NOTE] we used to attach auth token, but seems this can cause 403
      // redirect url is public anyway
      //Authorization: `token ${token}`,
    },
  })

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
    .map((line) => line.substr('2020-03-02T19:39:16.8832288Z '.length))

  const nextjsVersion = dateTimeStripped
    .find((x) => x.includes('RUNNING NEXTJS VERSION:') && !x.includes('$('))
    ?.split('RUNNING NEXTJS VERSION:')
    .pop()
    ?.trim()!

  console.log('Found Next.js version: ', nextjsVersion)

  return nextjsVersion
}

// Download logs for a job in a workflow run by reading redirect url from workflow log response.
async function fetchJobLogsFromWorkflow(
  octokit: Octokit,
  token: string,
  job: Job
): Promise<{ logs: string; job: Job }> {
  console.log(
    `fetchJobLogsFromWorkflow ${job.name}: Checking test results for the job`
  )

  // downloadJobLogsForWorkflowRun returns a redirect to the actual logs
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
      //Authorization: `token ${token}`,
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
    .map((line) => line.substr('2020-03-02T19:39:16.8832288Z '.length))

  const logs = dateTimeStripped.join('\n')

  return { logs, job }
}

// Collect necessary inputs to run actions,
async function getInputs(): Promise<{
  token: string
  shouldDiffWithMain: boolean
  octokit: Octokit
  prNumber: number | undefined
  sha: string
  noBaseComparison: boolean
  shouldExpandResultMessages: boolean
}> {
  const token = getInput('token')
  const shouldExpandResultMessages =
    getInput('expand_result_messages') === 'true'
  const diffBase = getInput('diff_base')
  const shouldDiffWithMain = diffBase === 'main'
  // For the daily cron workflow, we don't compare to previous but post daily summary
  const noBaseComparison = diffBase === 'none'
  if (diffBase !== 'main' && diffBase !== 'release' && diffBase !== 'none') {
    console.error('Invalid diff_base, must be "main" or "release" or "none"')
    process.exit(1)
  }

  if (!shouldExpandResultMessages) {
    console.log('Test report comment will not include result messages.')
  }

  const octokit = getOctokit(token)

  const prNumber = context?.payload?.pull_request?.number
  const sha = context?.sha

  let comments:
    | Awaited<ReturnType<typeof octokit.rest.issues.listComments>>['data']
    | null = null

  if (prNumber) {
    console.log('Trying to collect integration stats for PR', {
      prNumber,
      sha: sha,
    })

    comments = await octokit.paginate(octokit.rest.issues.listComments, {
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

  console.log('getInputs: these inputs will be used to collect test results', {
    token: !!token,
    shouldDiffWithMain,
    prNumber,
    sha,
    diff_base: getInput('diff_base'),
  })

  return {
    token,
    shouldDiffWithMain,
    octokit,
    prNumber,
    sha,
    noBaseComparison,
    shouldExpandResultMessages,
  }
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

  // Filter out next.js build setup jobs
  const nextjsBuildSetupJob = jobs?.find((job) =>
    /Build Next.js for the turbopack integration test$/.test(job.name)
  )

  // Next.js build setup jobs includes the version of next.js that is being tested, try to read it.
  const nextjsVersion = await findNextJsVersionFromBuildLogs(
    octokit,
    token,
    nextjsBuildSetupJob
  )

  // Find out next-swc build workflow
  const nextSwcBuildJob = jobs?.find((job) =>
    job.name.includes('Build Next.js for the turbopack integration test')
  )
  const nextSwcBuildLogs = (
    await fetchJobLogsFromWorkflow(octokit, token, nextSwcBuildJob)
  ).logs.split('\n')
  const buildTimeMatch = (
    nextSwcBuildLogs.find((line) => line.includes('Time (abs ≡):')) ?? ''
  ).match(/  ([+-]?(?=\.\d|\d)(?:\d+)?(?:\.?\d*))(?:[Ee]([+-]?\d+))? s/)
  const buildTime = buildTimeMatch?.length >= 2 ? buildTimeMatch[1] : undefined
  const nextSwcBuildSize = (
    nextSwcBuildLogs.find(
      (line) =>
        line.includes('NEXT_SWC_FILESIZE:') &&
        /NEXT_SWC_FILESIZE: (\d+)/.test(line)
    ) ?? ''
  ).match(/NEXT_SWC_FILESIZE: (\d+)/)[1]

  console.log(`Found next-swc build information from build logs`, {
    buildTime,
    nextSwcBuildSize,
  })

  // Filter out next.js integration test jobs
  const integrationTestJobs = jobs?.filter((job) =>
    /Next\.js integration test \([^)]*\) \([^)]*\)$/.test(job.name)
  )

  console.log(
    `Logs found for ${integrationTestJobs.length} jobs`,
    integrationTestJobs.map((job) => job.name)
  )

  // Iterate over all of next.js integration test jobs, read logs and collect failed test results if exists.
  const fullJobLogsFromWorkflow = await Promise.all(
    integrationTestJobs.map((job) =>
      fetchJobLogsFromWorkflow(octokit, token, job)
    )
  )

  console.log('Logs downloaded for all jobs')

  const testResultManifest: TestResultManifest = {
    nextjsVersion,
    buildTime,
    buildSize: nextSwcBuildSize,
    ref: sha,
  } as any

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
        let testData
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

  testResultManifest.flakyMonitorJobResults = flakyMonitorJobResults
  testResultManifest.result = jobResults

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
  octokit: Octokit,
  shouldDiffWithMain: boolean
): Promise<TestResultManifest | null> {
  console.log('Trying to find latest test results to compare')

  // First, get the tree of `test-results` from `nextjs-integration-test-data` branch
  const branchTree = (
    await octokit.rest.git.getTree({
      ...context.repo,
      tree_sha: 'refs/heads/nextjs-integration-test-data',
    })
  ).data.tree.find((tree) => tree.path === 'test-results')

  if (!branchTree || !branchTree.sha) {
    console.error("Couldn't find existing test results")
    return null
  }

  // Get the trees under `/test-results`
  const testResultsTree = (
    await octokit.rest.git.getTree({
      ...context.repo,
      tree_sha: branchTree.sha,
    })
  ).data.tree

  // If base is main, get the tree under `test-results/main`
  // Otherwise iterate over all the trees under `test-results` then find latest next.js release
  let testResultJsonTree:
    | Awaited<
        ReturnType<Awaited<Octokit['rest']['git']['getTree']>>
      >['data']['tree']
    | undefined

  if (shouldDiffWithMain) {
    console.log('Trying to find latest test results from main branch')
    const baseTree = testResultsTree.find((tree) => tree.path === 'main')

    if (!baseTree || !baseTree.sha) {
      console.log('There is no base to compare test results against')
      return null
    }
    console.log('Found base tree', baseTree)

    // Now tree should point the list of .json for the actual test results
    testResultJsonTree = (
      await octokit.rest.git.getTree({
        ...context.repo,
        tree_sha: baseTree.sha,
      })
    ).data.tree
  } else {
    console.log('Trying to find latest test results from next.js release')
    const getVersion = (v: { path?: string }) => {
      if (v.path) {
        console.log('Trying to get version from base path', v.path)
        const base = path.basename(v.path, '.json')
        const ret = base.split('-').slice(1, 3).join('-')
        console.log('Found version', ret)
        return ret
      }

      return null
    }

    const baseTree = testResultsTree
      .filter((tree) => tree.path !== 'main')
      .reduce((acc, value) => {
        if (!acc) {
          return value
        }

        const currentVersion = semver.valid(getVersion(value))
        const accVersion = semver.valid(getVersion(acc))

        if (!currentVersion || !accVersion) {
          return acc
        }

        return semver.gt(currentVersion, accVersion) ? value : acc
      }, null)

    if (!baseTree || !baseTree.sha) {
      console.log('There is no base to compare test results against')
      return null
    }
    console.log('Found base tree', baseTree)

    // If the results is for the release, no need to traverse down the tree
    testResultJsonTree = [baseTree]
  }

  if (!testResultJsonTree) {
    console.log('There is no test results stored in the base yet')
    return null
  }

  // Find the latest test result tree, iterate results file names to find out the latest one.
  // Filename follow ${yyyyMMddHHmm}-${sha}.json format.
  const actualTestResultTree = testResultJsonTree.reduce(
    (acc, value) => {
      const dateStr = value.path?.split('-')[0].match(/(....)(..)(..)(..)(..)/)

      if (!dateStr || dateStr.length < 5) {
        return acc
      }

      const date = new Date(
        dateStr![1] as any,
        (dateStr![2] as any) - 1,
        dateStr![3] as any,
        dateStr![4] as any,
        dateStr![5] as any
      )
      if (!acc) {
        return {
          date,
          value,
        }
      }

      return acc.date >= date ? acc : { date, value }
    },
    null as any as { date: Date; value: (typeof testResultJsonTree)[0] }
  )

  if (!actualTestResultTree || !actualTestResultTree?.value?.sha) {
    console.log('There is no test results json stored in the base yet')
    return null
  }

  console.log(
    'Found test results to compare against: ',
    actualTestResultTree.value
  )

  // actualTestResultTree should point to the file that contains the test results
  // we can try to read now.
  const { data } = await octokit.rest.git.getBlob({
    ...context.repo,
    file_sha: actualTestResultTree.value.sha,
  })

  const { encoding, content } = data

  if (encoding === 'base64') {
    return JSON.parse(Buffer.from(content, 'base64').toString())
  } else if (encoding === 'utf-8') {
    return JSON.parse(content)
  } else {
    throw new Error('Unknown encoding: ' + encoding)
  }
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
  shouldDiffWithMain: boolean,
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

  const shortCurrentNextJsVersion = jobResults.nextjsVersion.split(' ')[1]

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

  const shortBaseNextJsVersion = baseResults.nextjsVersion.split(' ')[1]

  // Append summary test report to the comment body
  let ret = `### Test summary
|   | ${
    shouldDiffWithMain
      ? `main (${baseResults.ref} / ${shortBaseNextJsVersion})`
      : `release (${baseResults.ref} / ${shortBaseNextJsVersion})`
  } | Current (${sha} / ${shortCurrentNextJsVersion}) | Diff (Failed) |
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
    shouldDiffWithMain,
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
    : await getTestResultDiffBase(octokit, shouldDiffWithMain)

  const postCommentAsync = createCommentPostAsync(octokit, prNumber)

  const failedTestLists = []
  const passedTestsLists = []
  // Collect failed test results for each job. We don't use this actively yet.
  const perJobFailedLists = {}

  // Consturct a comment body to post test report with summary & full details.
  const comments = jobResults.result.reduce((acc, value, idx) => {
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
        getTestSummary(
          sha,
          shouldDiffWithMain,
          noBaseComparison ? null : baseResults,
          jobResults
        ),
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
