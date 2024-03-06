import Range = require('../classes/range');
import SemVer = require('../classes/semver');
import semver = require('../');

/**
 * Return true if version is less than all the versions possible in the range.
 */
declare function ltr(
    version: string | SemVer,
    range: string | Range,
    optionsOrLoose?: boolean | semver.Options,
): boolean;

export = ltr;
