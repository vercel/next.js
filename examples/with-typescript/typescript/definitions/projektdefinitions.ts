interface RegionInfo {
    name: string;
    visitInfo: Date | number;
}
interface RegionParagraphProps {
    data: RegionInfo;
}
interface indexState {
    regionData: Array<RegionInfo>;
}