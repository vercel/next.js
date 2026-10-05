//! Binary sections and JSON header for the per-route analyzer artifact.

use turbo_tasks_fs::rope::{Rope, RopeBuilder};

use crate::analyze::{
    ANALYZE_SCHEMA_VERSION, AnalyzeDataBuilder, AnalyzeDataHeader, EdgesData,
    EdgesDataSectionBuilder,
};

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
