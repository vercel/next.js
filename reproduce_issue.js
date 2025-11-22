const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const http = require('http')

const tempDir = path.join(__dirname, 'reproduce-38863')

if (fs.existsSync(tempDir)) {
  fs.rmSync(tempDir, { recursive: true, force: true })
}
fs.mkdirSync(tempDir)

const packageJson = {
  name: 'reproduce-38863',
  version: '1.0.0',
  scripts: {
    dev: 'next dev --webpack -p 3456',
    build: 'next build',
    start: 'next start -p 3456',
  },
  dependencies: {
    next: 'file:../packages/next',
    react: 'latest',
    'react-dom': 'latest',
  },
}

fs.writeFileSync(
  path.join(tempDir, 'package.json'),
  JSON.stringify(packageJson, null, 2)
)

const pagesDir = path.join(tempDir, 'pages')
fs.mkdirSync(pagesDir)

const indexPage = `
export default function Home() {
  return <h1>Hello</h1>
}
`
fs.writeFileSync(path.join(pagesDir, 'index.js'), indexPage)

console.log('Installing dependencies...')
const install = spawn('npm', ['install'], {
  cwd: tempDir,
  shell: true,
  stdio: 'inherit',
})

install.on('close', (code) => {
  if (code !== 0) {
    console.error('Install failed')
    process.exit(code)
  }

  console.log('Starting next dev...')
  const dev = spawn('npm', ['run', 'dev'], { cwd: tempDir, shell: true })

  dev.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`)
    if (data.toString().includes('Ready in')) {
      checkPostRequest()
    }
  })

  dev.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`)
  })

  function checkPostRequest() {
    console.log('Sending POST request...')
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3456,
        path: '/',
        method: 'POST',
      },
      (res) => {
        console.log(`STATUS: ${res.statusCode}`)
        if (res.statusCode === 200) {
          console.log('Reproduced: Got 200 OK on POST request in dev mode.')
        } else if (res.statusCode === 405) {
          console.log('Not Reproduced: Got 405 Method Not Allowed.')
        } else {
          console.log(`Got unexpected status: ${res.statusCode}`)
        }

        // Cleanup
        dev.kill()
        // process.exit(0); // Let the user see the output
      }
    )

    req.on('error', (e) => {
      console.error(`problem with request: ${e.message}`)
      dev.kill()
    })

    req.end()
  }
})
