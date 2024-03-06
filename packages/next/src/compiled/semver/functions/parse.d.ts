import SemVer = require('../classes/semver');
import semver = require('../');

/**
 * Return the parsed version as a SemVer object, or null if it's not valid.
 */
declare function parse(
    version: string | SemVer | null | undefined,
    optionsOrLoose?: boolean | semver.Options,
): SemVer | null;

export = parse;
