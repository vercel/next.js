// Type definitions for ci-info 2.0
// Project: https://github.com/watson/ci-info
// Definitions by: Florian Keller <https://github.com/ffflorian>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

/**
 * Returns a boolean. Will be `true` if the code is running on a CI server,
 * otherwise `false`.
 *
 * Some CI servers not listed here might still trigger the `ci.isCI`
 * boolean to be set to `true` if they use certain vendor neutral environment
 * variables. In those cases `ci.name` will be `null` and no vendor specific
 * boolean will be set to `true`.
 */
export const isCI: boolean;
/**
 * Returns a boolean if PR detection is supported for the current CI server.
 * Will be `true` if a PR is being tested, otherwise `false`. If PR detection is
 * not supported for the current CI server, the value will be `null`.
 */
export const isPR: boolean | null;
/**
 * Returns a string containing name of the CI server the code is running on. If
 * CI server is not detected, it returns `null`.
 *
 * Don't depend on the value of this string not to change for a specific vendor.
 * If you find your self writing `ci.name === 'Travis CI'`, you most likely want
 * to use `ci.TRAVIS` instead.
 */
export const name: string | null;

export const APPVEYOR: boolean;
export const AZURE_PIPELINES: boolean;
export const BAMBOO: boolean;
export const BITBUCKET: boolean;
export const BITRISE: boolean;
export const BUDDY: boolean;
export const BUILDKITE: boolean;
export const CIRCLE: boolean;
export const CIRRUS: boolean;
export const CODEBUILD: boolean;
export const CODESHIP: boolean;
export const DRONE: boolean;
export const DSARI: boolean;
export const GITLAB: boolean;
export const GOCD: boolean;
export const HUDSON: boolean;
export const JENKINS: boolean;
export const MAGNUM: boolean;
export const NETLIFY: boolean;
export const SAIL: boolean;
export const SEMAPHORE: boolean;
export const SHIPPABLE: boolean;
export const SOLANO: boolean;
export const STRIDER: boolean;
export const TASKCLUSTER: boolean;
export const TEAMCITY: boolean;
export const TRAVIS: boolean;
