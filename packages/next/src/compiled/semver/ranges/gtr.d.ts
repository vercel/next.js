import Range = require('../classes/range');
import SemVer = require('../classes/semver');
import semver = require('../');

/**
 * Return true if version is greater than all the versions possible in the range.
 */
declare function gtr(
    version: string | SemVer,
    range: string | Range,
    optionsOrLoose?: boolean | semver.Options,
): boolean;

export = gtr;
