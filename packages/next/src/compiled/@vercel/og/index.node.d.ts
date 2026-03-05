import { ReactElement } from 'react';
import { I as ImageResponseOptions, a as ImageResponseNodeOptions } from './types-d38469ff.js';
import { Readable } from 'stream';
import "next/dist/compiled/@vercel/og/satori";
import 'http';

declare class ImageResponse extends Response {
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
declare function unstable_createNodejsStream(element: ReactElement, options?: Omit<ImageResponseNodeOptions, 'status' | 'statusText' | 'headers'>): Promise<Readable>;
type NodeImageResponse = typeof ImageResponse;

export { ImageResponse, ImageResponseOptions, NodeImageResponse, unstable_createNodejsStream };
