import SemVer = require('../classes/semver');
import semver = require('../');

/**
 * Returns an array of prerelease components, or null if none exist.
 */
declare function prerelease(
    version: string | SemVer,
    optionsOrLoose?: boolean | semver.Options,
): ReadonlyArray<string> | null;

export = prerelease;
