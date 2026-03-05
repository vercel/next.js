import { ReactElement } from 'react';
import { I as ImageResponseOptions } from './types-d38469ff.js';
import "next/dist/compiled/@vercel/og/satori";
import 'http';

declare class ImageResponse extends Response {
    constructor(element: ReactElement, options?: ImageResponseOptions);
}
type EdgeImageResponse = typeof ImageResponse;

export { EdgeImageResponse, ImageResponse, ImageResponseOptions };
