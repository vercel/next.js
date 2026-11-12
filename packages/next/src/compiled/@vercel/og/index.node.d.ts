import { ReactElement } from 'react';
import { ImageResponseOptions, ImageResponseNodeOptions } from './types.js';
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
/**
 * The subset of sharp's API that is used to rasterize the SVG produced by
 * satori. `sharp` itself satisfies this.
 */
type SharpLike = (input: Uint8Array) => {
    resize(width: number): {
        png(): {
            toBuffer(): Promise<Uint8Array>;
        };
    };
};
/**
 * Renders the PNG bytes of an `ImageResponse`, rasterizing with `sharp` instead
 * of the bundled resvg build or the optionally installed `sharp` package.
 * Options are the same as `ImageResponse`'s, but only the image options are
 * used.
 *
 * Added by a Next.js patch.
 */
declare function unstable_renderWithSharp(sharp: SharpLike, element: ReactElement, options?: ImageResponseOptions): Promise<Uint8Array>;
type NodeImageResponse = typeof ImageResponse;

export { ImageResponse, ImageResponseOptions, NodeImageResponse, SharpLike, unstable_createNodejsStream, unstable_renderWithSharp };
