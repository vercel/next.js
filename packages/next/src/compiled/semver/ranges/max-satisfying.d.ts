import Range = require('../classes/range');
import SemVer = require('../classes/semver');
import semver = require('../');

/**
 * Return the highest version in the list that satisfies the range, or null if none of them do.
 */
declare function maxSatisfying<T extends string | SemVer>(
    versions: ReadonlyArray<T>,
    range: string | Range,
    optionsOrLoose?: boolean | semver.Options,
): T | null;

export = maxSatisfying;
