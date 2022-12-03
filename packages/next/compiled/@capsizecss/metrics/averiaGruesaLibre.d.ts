declare module '@capsizecss/metrics/averiaGruesaLibre' {
  interface AveriaGruesaLibreMetrics {
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
  export const fontMetrics: AveriaGruesaLibreMetrics;
  export default fontMetrics;
}
