//! Binary sections and JSON header for the per-route analyzer artifact.

use serde::Serialize;
use turbo_rcstr::RcStr;
use turbo_tasks_fs::rope::{Rope, RopeBuilder};

use crate::analyze::{
    ANALYZE_SCHEMA_VERSION, AnalyzeChunkGroupData, AnalyzeChunkPart, AnalyzeDataBuilder,
    AnalyzeOutputFile, AnalyzeOutputFileCoverage, AnalyzeRouteEntry, AnalyzeSource,
    AnalyzeUnjoinedModule, EdgesData, EdgesDataReference, EdgesDataSectionBuilder,
};

#[derive(Serialize)]
struct AnalyzeDataHeader {
    /// The header and modules.data must use the same supported schema version.
    pub schema_version: u32,
    pub module_index_hash: RcStr,
    pub sources: Vec<AnalyzeSource>,
    pub chunk_parts: Vec<AnalyzeChunkPart>,
    pub output_files: Vec<AnalyzeOutputFile>,
    /// Exact indices into this snapshot's modules.data.modules, one row per output file.
    pub output_file_modules: EdgesDataReference,
    pub output_file_module_coverage: Vec<AnalyzeOutputFileCoverage>,
    pub unjoined_modules: Vec<AnalyzeUnjoinedModule>,
    pub chunk_groups: Vec<AnalyzeChunkGroupData>,
    /// Exact endpoint roots; nested client references do not become roots.
    pub route_entries: Vec<AnalyzeRouteEntry>,
    /// Edges from chunks to chunk parts
    pub output_file_chunk_parts: EdgesDataReference,
    /// Edges from sources to chunk parts
    pub source_chunk_parts: EdgesDataReference,
    /// Edges from sources to their children sources
    pub source_children: EdgesDataReference,
    /// Root level sources, walking their children will reach all sources
    pub source_roots: Vec<u32>,
}

impl AnalyzeDataBuilder {
    pub(super) fn build(self) -> Rope {
        let source_roots = self
            .sources
            .iter()
            .enumerate()
            .filter_map(|(i, s)| {
                if s.source.parent_source_index.is_none() {
                    Some(i as u32)
                } else {
                    None
                }
            })
            .collect();

        let source_children =
            EdgesData::from_iterator(self.sources.iter().map(|s| &s.child_source_indices));

        let source_chunk_parts =
            EdgesData::from_iterator(self.sources.iter().map(|s| &s.chunk_part_indices));

        let output_file_chunk_parts =
            EdgesData::from_iterator(self.output_files.iter().map(|of| &of.chunk_part_indices));
        let output_file_modules =
            EdgesData::from_iterator(self.output_files.iter().map(|of| &of.module_indices));

        let mut binary_section = EdgesDataSectionBuilder::new();

        let header = AnalyzeDataHeader {
            schema_version: ANALYZE_SCHEMA_VERSION,
            module_index_hash: self.module_index_hash,
            sources: self.sources.into_iter().map(|s| s.source).collect(),
            chunk_parts: self.chunk_parts,
            output_file_module_coverage: self
                .output_files
                .iter()
                .map(|of| of.module_coverage)
                .collect(),
            output_file_modules: binary_section.add_edges(&output_file_modules),
            output_files: self
                .output_files
                .into_iter()
                .map(|of| of.output_file)
                .collect(),
            unjoined_modules: self.unjoined_modules,
            chunk_groups: self.chunk_groups,
            route_entries: self.route_entries,
            output_file_chunk_parts: binary_section.add_edges(&output_file_chunk_parts),
            source_chunk_parts: binary_section.add_edges(&source_chunk_parts),
            source_children: binary_section.add_edges(&source_children),
            source_roots,
        };

        let header_json = serde_json::to_vec(&header).unwrap();

        let mut rope = RopeBuilder::default();
        rope.push_bytes(&(header_json.len() as u32).to_be_bytes());
        rope.reserve_bytes(header_json.len() + binary_section.data.len());
        rope.push_bytes(&header_json);
        rope.push_bytes(&binary_section.data);
        rope.build()
    }
}
