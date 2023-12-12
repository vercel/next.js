import { EdgeImageResponse } from 'src/index.edge.types';
import { FigmaImageResponseProps } from 'src/types';
declare type InternalFigmaImageResponseProps = FigmaImageResponseProps & {
    Response: EdgeImageResponse;
};
export declare const FigmaImageResponse: ({ url, template, fonts, imageResponseOptions, Response, }: InternalFigmaImageResponseProps) => Promise<import("../index.edge").ImageResponse>;
export {};
