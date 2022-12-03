declare module '@capsizecss/metrics/pridi' {
  interface PridiMetrics {
    familyName: string;
    category: string;
    capHeight: number;
    ascent: number;
    descent: number;
    lineGap: number;
    unitsPerEm: number;
    xHeight: number;
    xAvgCharWidth: number;
    xAvgLowercase: number;
    xAvgWeightedOs2: number;
    xAvgWeightedWiki: number;
    xAvgLetterFrequency: number;
  }
  export const fontMetrics: PridiMetrics;
  export default fontMetrics;
}
