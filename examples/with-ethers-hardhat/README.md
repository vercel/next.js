# Ethers.js and Hardhat Example

This example shows a Next.js decentralized app (dapp) using [Ethers.js](https://docs.ethers.io/v5/), [Hardhat](https://hardhat.org/) and [Typechain](https://github.com/dethcrypto/TypeChain).
It includes an example smart contract.

## Setup

Copy `.env.local.example` to `.env.local`

```bash
cp .env.local.example .env.local
```

Set environmental variables in .env.local:
* **ETHERSCAN_API_KEY** - Etherscan API Key. Go to https://info.etherscan.com/api-keys/ to learn how to create api key.
* **MAINNET_NODE_URL** - URL for mainnet node.
* **TESTNET_NODE_URL** - URL for testnet node.
* **PRIVATE_KEY** - Your private key exported from Metamask. Go to https://metamask.zendesk.com/hc/en-us/articles/360015289632-How-to-Export-an-Account-Private-Key to learn how to do it.

### Compile smart contract

```bash
yarn web3:compile
```

This will create required Typechain binding to smart contract

### Deploy smart contract to testnet
```text
yarn sc:deploy:testnet
```

Running deploy command will return contract address which you will need in next steps.

### Verify smart contract
```bash
yarn sc:verify:testnet -- <CONTRACT_ADDRESS>
```

Set environmental variables in .env.development:
* **NEXT_PUBLIC_NODE_URL** - URL of node
* **NEXT_PUBLIC_CONTRACT_ADDRESS** - Smart contract address from previous step

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-ethers-hardhat)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-ethers-hardhat&project-name=with-ethers-hardhat&repository-name=with-ethers-hardhat)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-ethers-hardhat with-ethers-hardhat-app
# or
yarn create next-app --example with-ethers-hardhat with-ethers-hardhat-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
