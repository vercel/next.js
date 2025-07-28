// @ts-check
const fs = require('fs')
const path = require('path')
const execa = require('execa')
const resolveFrom = require('resolve-from')

async function main() {
  const args = process.argv
  const branchName = args[args.indexOf('--branch-name') + 1]
  const tagName = args[args.indexOf('--tag-name') + 1]

  if (!branchName) {
    throw new Error('branchName value is missing!')
  }

  if (!tagName || !tagName.startsWith('v')) {
    throw new Error('tagName value is invalid "' + tagName + '"')
  }

  const githubToken = process.env.RELEASE_BOT_GITHUB_TOKEN

  if (!githubToken) {
    console.log(`Missing RELEASE_BOT_GITHUB_TOKEN`)
    return
  }

  const configStorePath = resolveFrom(
    path.join(process.cwd(), 'node_modules/release'),
    'configstore'
  )
  const ConfigStore = require(configStorePath)

  const config = new ConfigStore('release')
  config.set('token', githubToken)

  await execa(
    `git remote set-url origin https://nextjs-bot:${githubToken}@github.com/vercel/next.js.git`,
    { stdio: 'inherit', shell: true }
  )
  await execa(`git config user.name "nextjs-bot"`, {
    stdio: 'inherit',
    shell: true,
  })
  await execa(`git config user.email "it+nextjs-bot@vercel.com"`, {
    stdio: 'inherit',
    shell: true,
  })
  await execa(`git checkout -b "${branchName}"`, {
    stdio: 'inherit',
    shell: true,
  })
  await execa(`git reset --hard ${tagName}`, {
    stdio: 'inherit',
    shell: true,
  })
  const lernaPath = path.join(__dirname, '..', 'lerna.json')
  const existingLerna = JSON.parse(
    await fs.promises.readFile(lernaPath, 'utf8')
  )
  existingLerna.command.publish.allowBranch.push(branchName)

  await fs.promises.writeFile(lernaPath, JSON.stringify(existingLerna, null, 2))

  const buildAndDeployPath = path.join(
    __dirname,
    '..',
    '.github',
    'workflows',
    'build_and_deploy.yml'
  )
  const buildAndDeploy = await fs.promises.readFile(buildAndDeployPath, 'utf8')
  await fs.promises.writeFile(
    buildAndDeployPath,
    buildAndDeploy.replace(/refs\/heads\/canary/g, `refs/heads/${branchName}`)
  )

  const buildAndTestPath = path.join(
    __dirname,
    '..',
    '.github',
    'workflows',
    'build_and_test.yml'
  )
  const buildAndTest = await fs.promises.readFile(buildAndTestPath, 'utf8')
  await fs.promises.writeFile(
    buildAndTestPath,
    buildAndTest.replace(`['canary']`, `['${branchName}']`)
  )

  await execa(`git add .`, {
    stdio: 'inherit',
    shell: true,
  })
  await execa(`git commit -m "setup release branch"`, {
    stdio: 'inherit',
    shell: true,
  })
  await execa(`git push origin "${branchName}"`, {
    stdio: 'inherit',
    shell: true,
  })

  console.log(`Waiting 5s before updating branch rules`)
  await new Promise((resolve) => setTimeout(resolve, 5_000))

  const updateEnvironmentRes = await fetch(
    'https://api.github.com/repos/vercel/next.js/environments/release-stable/deployment-branch-policies',
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${githubToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ name: branchName }),
    }
  )

  if (!updateEnvironmentRes.ok) {
    console.error(
      { status: updateEnvironmentRes.status },
      await updateEnvironmentRes.text()
    )
    throw new Error(`Failed to update environment branch rules`)
  }
  console.log(`Successfully updated deployment environment branch rules`)
}

main()
