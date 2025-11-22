const http = require('http')
const { spawn } = require('child_process')

function check(port, method) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: port,
        path: '/',
        method: method,
      },
      (res) => {
        resolve(res.statusCode)
      }
    )
    req.on('error', reject)
    req.end()
  })
}

async function run() {
  console.log('Starting Next.js in dev mode...')
  const dev = spawn('npx', ['next', 'dev', '-p', '3001'], {
    cwd: __dirname,
    shell: true,
    stdio: 'inherit',
  })

  // Wait for server to start
  await new Promise((r) => setTimeout(r, 5000))

  try {
    console.log('Sending POST request to dev server...')
    const status = await check(3001, 'POST')
    console.log(`Dev server POST status: ${status}`)

    if (status === 200) {
      console.log(
        'FAIL: Dev server returned 200 for POST request (Expected 405)'
      )
    } else if (status === 405) {
      console.log('SUCCESS: Dev server returned 405 for POST request')
    } else {
      console.log(`Unexpected status: ${status}`)
    }
  } catch (e) {
    console.error('Error:', e)
  } finally {
    dev.kill()
    // On Windows, we might need to kill the process tree or use taskkill
    try {
      require('child_process').execSync('taskkill /F /IM node.exe /T')
    } catch (e) {}
    process.exit(0)
  }
}

run()
