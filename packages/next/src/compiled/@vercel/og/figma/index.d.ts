import type { EdgeImageResponse } from '../index.edge';
import { FigmaImageResponseProps } from '../types';
type InternalFigmaImageResponseProps = FigmaImageResponseProps & {
    Response: EdgeImageResponse;
};
export declare const FigmaImageResponse: ({ url, template, fonts, imageResponseOptions, Response, }: InternalFigmaImageResponseProps) => Promise<import("../index.edge").ImageResponse>;
export {};
