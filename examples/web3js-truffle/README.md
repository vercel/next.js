# Web3.js Truffle example

This example demonstrates the basic setup of dApp development using [truffle](https://trufflesuite.com/) as the smart-contract development tool, and web3.js to interact with the deployed contract in the frontend.

`/client/components/Web3Injector` sets up the web3 environment with the provider (in this case truffle), and returns **web3**, **accounts**, and **contract** to the `/client/pages/index.js` as props. There it interacts with the contract.

The contract used is a basic simple-storage example, which can be found in `/truffle/contracts/Storage.sol`. The tests for the contract with, emitted events are written in `/truffle/test/Storage.test.js`.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/web3js-truffle&project-name=web3js-truffle&repository-name=web3js-truffle)

## Setup

#### TestRPC

You to install [`ganache-cli`](https://www.npmjs.com/package/ganache-cli), a CLI tool to start a TestRPC. You can use any other TestRPC just keep in mind the network port.

To install ganache-cli run:

```bash
npm i ganache-cli
```

Run this command in from any terminal, to boot up the TestRPC:

```bash
ganache-cli
```

`ganache-cli` runs on port `8545` by default.
If you're using other TestRPC make sure the port number is written correctly in the **networks.development** section in `/truffle/truffle-config.js`.

#### Truffle

The next step is to compile and migrate the smart-contract.
open another terminal and run:

```bash
cd truffle
truffle compile
truffle migrate
```

P.S. `truffle migrate` command first compiles then migrates, you can skip `truffle compile` if you want.
Make sure the steps are successful.

You can also run the tests to make sure everything works on the smart-contract part.
to test the contract run:

```bash
truffle test
```

All tests should succeed.

#### Next.js

Now we're all set for the frontend. Go to `/client` directory and start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `/client/pages/index.js`. The page auto-updates as you edit the file.
You can also adjust the `/client/pages/Web3Injector.js` file as per your choice, as it sets up the web3 object and the contract instance.

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example web3js-truffle web3js-truffle-app
```

```bash
yarn create next-app --example web3js-truffle web3js-truffle-app
```

```bash
pnpm create next-app --example web3js-truffle web3js-truffle-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
