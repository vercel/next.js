declare module '@capsizecss/metrics/griffy' {
  interface GriffyMetrics {
    familyName: string;
    category: string;
    ascent: number;
    descent: number;
    lineGap: number;
    unitsPerEm: number;
    xAvgCharWidth: number;
    xAvgLowercase: number;
    xAvgWeightedOs2: number;
    xAvgWeightedWiki: number;
    xAvgLetterFrequency: number;
  }
  export const fontMetrics: GriffyMetrics;
  export default fontMetrics;
}
