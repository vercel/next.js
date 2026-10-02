//! Binary sections and JSON header for the per-route analyzer artifact.

use std::io::Write;

use anyhow::Result;
use byteorder::{BE, WriteBytesExt};
use serde::Serialize;
use turbo_rcstr::RcStr;
use turbo_tasks_fs::rope::{Rope, RopeBuilder};

use crate::analyze::{
    ANALYZE_SCHEMA_VERSION, AnalyzeChunkGroupData, AnalyzeChunkLoadEdge, AnalyzeChunkPart,
    AnalyzeDataBuilder, AnalyzeOutputFile, AnalyzeOutputFileCoverage, AnalyzeRouteEntry,
    AnalyzeSource, AnalyzeUnjoinedChunkLoadEdge, AnalyzeUnjoinedModule, EdgesDataReference,
    EdgesDataSectionBuilder,
};

/// Shared row-offset encoding used by both analyzer artifacts.
pub struct EdgesData {
    pub offsets: Vec<u32>,
    pub data: Vec<u32>,
}

impl EdgesData {
    pub(super) fn from_iterator<'a>(
        iterable: impl IntoIterator<Item = &'a Vec<u32>> + Clone,
    ) -> Self {
        let mut current_offset = 0;
        let sum: usize = iterable.clone().into_iter().map(|v| v.len()).sum();
        let mut data = Vec::with_capacity(sum);
        let offsets = iterable
            .into_iter()
            .map(|edges| {
                current_offset += edges.len() as u32;
                data.extend(edges);
                current_offset
            })
            .collect();
        Self { offsets, data }
    }

    pub(super) fn write(&self, writer: &mut impl Write) -> Result<()> {
        writer.write_u32::<BE>(self.offsets.len() as u32)?;
        for &offset in &self.offsets {
            writer.write_u32::<BE>(offset)?;
        }
        for &data in &self.data {
            writer.write_u32::<BE>(data)?;
        }
        Ok(())
    }
}

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
    /// Non-asset reference wrappers whose direct runtime load type is unknown.
    pub unresolved_output_references: Vec<u32>,
    pub unjoined_modules: Vec<AnalyzeUnjoinedModule>,
    pub chunk_groups: Vec<AnalyzeChunkGroupData>,
    pub chunk_load_edges: Vec<AnalyzeChunkLoadEdge>,
    pub unjoined_chunk_load_edges: Vec<AnalyzeUnjoinedChunkLoadEdge>,
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
    /// Link the attributed sources into their directory hierarchy before
    /// serializing the route artifact.
    pub(super) fn finish_sources(&mut self) {
        let mut i: u32 = 0;
        while i < self.sources.len().try_into().unwrap() {
            let source = &self.sources[i as usize];
            let path = source.source.path.as_str();
            if !path.is_empty() {
                let (parent_path, path) = if let Some(pos) = path.trim_end_matches('/').rfind('/') {
                    (&path[..pos + 1], &path[pos + 1..])
                } else {
                    ("", path)
                };
                let parent_path = parent_path.to_string();
                let path = path.into();
                let (parent_source, parent_index) = self.ensure_source(&parent_path);
                parent_source.child_source_indices.push(i);
                self.sources[i as usize].source.parent_source_index = Some(parent_index);
                self.sources[i as usize].source.path = path;
            }
            i += 1;
        }
    }

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
            unresolved_output_references: self
                .output_files
                .iter()
                .map(|of| of.unresolved_references)
                .collect(),
            output_files: self
                .output_files
                .into_iter()
                .map(|of| of.output_file)
                .collect(),
            unjoined_modules: self.unjoined_modules,
            chunk_groups: self.chunk_groups,
            chunk_load_edges: self.chunk_load_edges,
            unjoined_chunk_load_edges: self.unjoined_chunk_load_edges,
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
