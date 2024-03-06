import Range = require('../classes/range');
import semver = require('../');

/**
 * Return true if the subRange range is entirely contained by the superRange range.
 */
declare function subset(
    sub: string | Range,
    dom: string | Range,
    options?: semver.Options,
): boolean;

export = subset;
