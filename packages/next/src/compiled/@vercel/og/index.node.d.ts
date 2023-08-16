/// <reference types="node" />
import type { ReactElement } from 'react';
import type { ImageResponseNodeOptions, ImageResponseOptions } from './types';
import { Readable } from 'stream';
export declare class ImageResponse {
    constructor(element: ReactElement, options?: ImageResponseOptions);
}
/**
 * Creates a pipeable stream of the rendered image in a lambda function.
 * All parameters are the same as `ImageResponse`.
 * @example
 * ```js
 * import { unstable_createNodejsStream } from '@vercel/og'
 *
 * export default async (req, res) => {
 *   const stream = await unstable_createNodejsStream(<div>Hello World</div>, { ... })
 *   res.setHeader('Content-Type', 'image/png')
 *   res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
 *   res.statusCode = 200
 *   res.statusMessage = 'OK'
 *   stream.pipe(res)
 * }
 * ```
 */
export declare function unstable_createNodejsStream(element: ReactElement, options?: Omit<ImageResponseNodeOptions, 'status' | 'statusText' | 'headers'>): Promise<Readable>;
