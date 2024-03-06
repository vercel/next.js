import SemVer = require('../classes/semver');
import semver = require('../');

/**
 * Return the minor version number.
 */
declare function minor(version: string | SemVer, optionsOrLoose?: boolean | semver.Options): number;

export = minor;
