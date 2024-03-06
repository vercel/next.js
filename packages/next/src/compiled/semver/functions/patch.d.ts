import SemVer = require('../classes/semver');
import semver = require('../');

/**
 * Return the patch version number.
 */
declare function patch(version: string | SemVer, optionsOrLoose?: boolean | semver.Options): number;

export = patch;
