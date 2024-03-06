import SemVer = require('../classes/semver');
import semver = require('../');

/**
 * v1 >= v2
 */
declare function gte(v1: string | SemVer, v2: string | SemVer, optionsOrLoose?: boolean | semver.Options): boolean;

export = gte;
