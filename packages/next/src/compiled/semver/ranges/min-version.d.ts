import Range = require('../classes/range');
import SemVer = require('../classes/semver');
import semver = require('../');

/**
 * Return the lowest version that can possibly match the given range.
 */
declare function minVersion(range: string | Range, optionsOrLoose?: boolean | semver.Options): SemVer | null;

export = minVersion;
