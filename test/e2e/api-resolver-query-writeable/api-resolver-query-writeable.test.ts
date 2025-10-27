import {killApp, initNextServerScript, fetchViaHTTP} from 'next-test-utils'
import {join} from "path";
import { ChildProcess } from 'child_process';
import getPort from "get-port";

const appDir = join(__dirname, '../')
let appPort: number
let server: ChildProcess

describe('api-resolver-query-writeable', () => {
    it('should allow req.query to be writable and reflect changes made in the API handler', async () => {
        await startServer()
        const data = await makeRequest()
        expect(data).toEqual({query: {hello: 'yes', changed: 'yes'}})
        await killApp(server)
    })
})

async function makeRequest() {
    const data = await fetchViaHTTP(appPort, '/api?hello=yes', null, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
        },
    }).then((res) => res.ok && res.json())

    return data
}

const startServer = async () => {
    const scriptPath = join(appDir, 'server.js')
    appPort = await getPort()
    const env = Object.assign(
        {...process.env},
        {PORT: `${appPort}`, CUSTOM_SERVER: 'true'}
    )

    server = await initNextServerScript(
        scriptPath,
        /ready on/i,
        env,
        /ReferenceError: options is not defined/,
    )
}
