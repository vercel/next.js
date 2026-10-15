/**
* compare function used when sorting object keys, `null` can be used to skip over sorting.
*/
type CompareKeys = ((a: string, b: string) => number) | null | undefined;

/**
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/

type DiffOptionsColor = (arg: string) => string;
interface DiffOptions {
	aAnnotation?: string;
	aColor?: DiffOptionsColor;
	aIndicator?: string;
	bAnnotation?: string;
	bColor?: DiffOptionsColor;
	bIndicator?: string;
	changeColor?: DiffOptionsColor;
	changeLineTrailingSpaceColor?: DiffOptionsColor;
	commonColor?: DiffOptionsColor;
	commonIndicator?: string;
	commonLineTrailingSpaceColor?: DiffOptionsColor;
	contextLines?: number;
	emptyFirstOrLastLinePlaceholder?: string;
	expand?: boolean;
	includeChangeCounts?: boolean;
	omitAnnotationLines?: boolean;
	patchColor?: DiffOptionsColor;
	printBasicPrototype?: boolean;
	maxDepth?: number;
	compareKeys?: CompareKeys;
	truncateThreshold?: number;
	truncateAnnotation?: string;
	truncateAnnotationColor?: DiffOptionsColor;
}

interface ParsedStack {
	method: string;
	file: string;
	line: number;
	column: number;
}
interface SerializedError {
	message: string;
	stacks?: ParsedStack[];
	stack?: string;
	name?: string;
	cause?: SerializedError;
	[key: string]: unknown;
}
interface TestError extends SerializedError {
	cause?: TestError;
	diff?: string;
	actual?: string;
	expected?: string;
}

declare function processError(_err: any, diffOptions?: DiffOptions, seen?: WeakSet<WeakKey>): TestError;

export { processError };
