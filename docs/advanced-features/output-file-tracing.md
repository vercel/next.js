---
description: Next.js automatically traces what files are needed by each page to allow easier deploying of your application. Learn how it works here.
---

# Output File Tracing

During a build, Next.js will automatically trace each page and its dependencies to determine all of the files that are needed for deploying a production version of your application.

This feature helps reduce the size of deployments drastically. Previously, when deploying with docker you would need to have all files from your package's `dependencies` installed to run `next start`, now you can leverage the traces output in the `.next/` directory to only include the necessary files.

Furthermore, this removes the need for leveraging the previously used `serverless` target which can cause various issues and also creates unnecessary duplication.

## How it works

While building, Next.js will use `@vercel/nft` which uses static analysis to detect all files that a page might load. Any `import`/`require` will be detected along with `fs` usage.

Next.js' production server is also traced for its needed files and output at `.next/next-server.js.nft.json` which can be leveraged in production.

To leverage the `.nft.json` files output in `.next` you can read the list of files in each trace which are relative to the `.nft.json` file and then copy them to your deployment location.

## Caveats

- There are some cases that we might fail to detect or might over-detect so there are two page level configs `unstable_includeFiles` and `unstable_excludeFiles` which allow providing an array of [globs](<https://en.wikipedia.org/wiki/Glob_(programming)>) relative to the project's root to either include or exclude in the trace.
- Next.js does not currently copy these files to a minimal deployment folder for you, although, a command is planned for the future to streamline this.
