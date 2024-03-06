import SemVer = require('../classes/semver');
import semver = require('../');

/**
 * Return the major version number.
 */
declare function major(version: string | SemVer, optionsOrLoose?: boolean | semver.Options): number;

export = major;
