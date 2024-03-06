import SemVer = require('../classes/semver');
import semver = require('../');

/**
 * Return the version incremented by the release type (major, minor, patch, or prerelease), or null if it's not valid.
 */
declare function inc(
    version: string | SemVer,
    release: semver.ReleaseType,
    optionsOrLoose?: boolean | semver.Options,
    identifier?: string,
): string | null;
declare function inc(version: string | SemVer, release: semver.ReleaseType, identifier?: string): string | null;

export = inc;
