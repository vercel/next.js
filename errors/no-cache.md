# No Cache Detected

#### Why This Error Occurred

A Next.js build was triggered in a continuous integration environment, but no cache was detected.

This results in slower builds and can hurt Next.js' persistent caching of client-side bundles across builds.

#### Possible Ways to Fix It

> **Note**: If this is a new project, or being built for the first time in your CI, you can ignore this error.
> However, you'll want to make sure it doesn't continue to happen and fix it if it does!

Configure Next.js' cache to be persisted across builds. Next.js stores its cache in the `.next/cache` directory.

Storing this folder across builds varies by CI provider. We've provided a list of a few common providers below.

**ZEIT Now**

Next.js caching is automatically configured for you. There's no action required on your part.

**CircleCI**

Edit your `save_cache` step in `.circleci/config.yml` to include `.next/cache`:

```yaml
steps:
  - save_cache:
      key: dependency-cache-{{ checksum "yarn.lock" }}
      paths:
        - ./node_modules
        - ./.next/cache
```

If you do not have a `save_cache` key, please follow CircleCI's [documentation on setting up build caching](https://circleci.com/docs/2.0/caching/).

**Travis CI**

Add or merge the following into your `.travis.yml`:

```yaml
cache:
  directories:
    - $HOME/.cache/yarn
    - node_modules
    - .next/cache
```

**GitLab CI**

Add or merge the following into your `.gitlab-ci.yml`:

```yaml
cache:
  key: ${CI_COMMIT_REF_SLUG}
  paths:
    - node_modules/
    - .next/cache/
```

**Netlify CI**

It is **not possible** to cache custom build files on Netlify. Please contact their support and request they support this behavior.

You can investigate using a 3rd party solution (e.g. [`cache-me-outside`](https://github.com/DavidWells/cache-me-outside)) to manually cache the Next.js output.

**AWS CodeBuild**

Add (or merge in) the following to your `buildspec.yml`:

```yaml
cache:
  paths:
    - 'node_modules/**/*' # Cache `node_modules` for faster `yarn` or `npm i`
    - '.next/cache/**/*' # Cache Next.js for faster application rebuilds
```

**GitHub Actions**

Using GitHub's [actions/cache](https://github.com/actions/cache), add the following step in your workflow file:

```yaml
uses: actions/cache@v1
with:
  path: ${{ github.workspace }}/.next/cache
  key: ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}
```

**Bitbucket Pipelines**

Add or merge the following into your `bitbucket-pipelines.yml` at the top level (same level as `pipelines`):

```yaml
definitions:
  caches:
    nextcache: .next/cache
```

Then reference it in the `caches` section of your pipeline's `step`:

```yaml
- step:
    name: your_step_name
    caches:
      - node
      - nextcache
```
