import { Project } from 'ts-morph';

/**
 * Find the list of globals used by source files in the provided project.
 * Analyzed source files can be filtered by provided a list of glob patterns (default to all TypeScript and JavaScript files, excluding type definitions)
 */
declare function findGlobals(sourcePath: string, project?: Project): string[];

/**
 * Returns true if the default export of the provided file is a function returning a web Response object.
 */
declare function hasEdgeSignature(sourcePath: string, project?: Project): boolean;

export { findGlobals, hasEdgeSignature };
