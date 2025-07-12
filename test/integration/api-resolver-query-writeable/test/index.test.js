/* eslint-env jest */

import {join} from 'path'
import {
    killApp,
    initNextServerScript,
    fetchViaHTTP,
} from 'next-test-utils'
import getPort from "get-port";


const appDir = join(__dirname, '../')
let appPort
let app
let server

const context = {}

function runTests() {
    it('should allow req.query to be writable and reflect changes made in the API handler', async () => {
        await startServer();
        const data = await makeRequest()
        expect(data).toEqual({'query': {'hello': 'yes', 'changed': 'yes'}})
        await killApp(app)
    })
}

async function makeRequest() {
    const data = await fetchViaHTTP(appPort, '/api?hello=yes', null, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
        }
    }).then((res) => res.ok && res.json())

    return data
}

const startServer = async (optEnv = {}, opts) => {
    const scriptPath = join(appDir, 'server.js')
    context.appPort = appPort = await getPort()
    const env = Object.assign(
        {...process.env},
        {PORT: `${appPort}`, CUSTOM_SERVER: 'true'},
        optEnv
    )

    server = await initNextServerScript(
        scriptPath,
        /ready on/i,
        env,
        /ReferenceError: options is not defined/,
        opts
    )
}

runTests()
