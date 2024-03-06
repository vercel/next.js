import Range = require('../classes/range');
import SemVer = require('../classes/semver');
import semver = require('../');

/**
 * Return true if the version satisfies the range.
 */
declare function satisfies(
    version: string | SemVer,
    range: string | Range,
    optionsOrLoose?: boolean | semver.Options,
): boolean;

export = satisfies;
