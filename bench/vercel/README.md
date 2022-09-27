# Benchmarking Next.js on production

This script allows you to measure some performance metrics of your local build of Next.js on production by uploading your current build to Vercel with an example app and running some basic benchmarks on it.

## Requirements

- the Vercel CLI

## Setup

Rename the provided `./env.local` file to `./env` and fill in the required `VERCEL_TEST_TOKEN` and `VERCEL_TEST_TEAM` values. You can find and generate those from vercel.com.

Run `pnpm install`, `pnpm bench` and profit.

Note: if you made some changes to Next.js, make sure you compiled them by running at the root of the monorepo either `pnpm dev` or `pnpm build --force`.

## How it works

- with the Vercel CLI, we setup a project
- we `npm pack` the local Next build and add it to the repo
- we upload the repo to Vercel and let it build
- once it builds, we get the deployment url and run some tests
