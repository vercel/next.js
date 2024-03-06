import Range = require('../classes/range');
import SemVer = require('../classes/semver');
import semver = require('../');

/**
 * Return true if the version is outside the bounds of the range in either the high or low direction.
 * The hilo argument must be either the string '>' or '<'. (This is the function called by gtr and ltr.)
 */
declare function outside(
    version: string | SemVer,
    range: string | Range,
    hilo: '>' | '<',
    optionsOrLoose?: boolean | semver.Options,
): boolean;
export = outside;
