use std::{io::Write, mem::take};

use anyhow::Result;
use byteorder::{BE, WriteBytesExt};
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, ResolvedVc, ValueToString, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::{
    File, FileContent, FileSystemPath,
    rope::{Rope, RopeBuilder},
};
use turbopack_analyze::split_chunk::split_output_asset_into_parts;
use turbopack_core::{
    asset::{Asset, AssetContent},
    output::{OutputAsset, OutputAssets},
};

use crate::route::Endpoint;

#[derive(
    Default, Clone, Debug, Deserialize, Eq, NonLocalValue, PartialEq, Serialize, TraceRawVcs,
)]
pub struct EdgesData {
    pub offsets: Vec<u32>,
    pub data: Vec<u32>,
}

impl EdgesData {
    fn from_iterator(iter: impl Iterator<Item = Vec<u32>>) -> Self {
        let mut offsets = vec![];
        let mut data = vec![];
        let mut current_offset = 0;
        for edges in iter {
            current_offset += edges.len() as u32;
            offsets.push(current_offset);
            data.extend(edges);
        }
        Self { offsets, data }
    }

    fn write(&self, writer: &mut impl Write) -> Result<()> {
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
pub struct AnalyzeModule {
    pub source_index: u32,
    pub layer_index: u32,
}

#[derive(Serialize)]
pub struct AnalyzeSource {
    pub parent_source_index: Option<u32>,
    /// Path. When there is a parent, this is concatenated to the parent's path.
    /// Folders end with a slash. Might have multiple path segments when folders contain only a
    /// single child.
    pub path: RcStr,
    pub source_size: u32,
}

#[derive(Serialize)]
pub struct AnalyzeChunkPart {
    pub source_index: u32,
    pub output_file_index: u32,
    pub size: u32,
}

#[derive(Serialize)]
pub struct AnalyzeOutputFile {
    pub filename: RcStr,
}

#[derive(Serialize)]
pub struct AnalyzeLayer {
    pub name: RcStr,
}

#[derive(Serialize)]
struct EdgesDataReference {
    pub offset: u32,
    pub length: u32,
}

#[derive(Serialize)]
struct AnalyzeDataHeader {
    pub modules: Vec<AnalyzeModule>,
    pub sources: Vec<AnalyzeSource>,
    pub chunk_parts: Vec<AnalyzeChunkPart>,
    pub output_files: Vec<AnalyzeOutputFile>,
    pub layers: Vec<AnalyzeLayer>,
    /// Edges from modules to modules
    pub module_dependents: EdgesDataReference,
    /// Edges from modules to modules
    pub async_module_dependents: EdgesDataReference,
    /// Edges from modules to modules
    pub module_dependencies: EdgesDataReference,
    /// Edges from modules to modules
    pub async_module_dependencies: EdgesDataReference,
    /// Edges from sources to modules
    pub source_modules: EdgesDataReference,
    /// Edges from chunks to chunk parts
    pub output_file_chunk_parts: EdgesDataReference,
    /// Edges from sources to chunk parts
    pub source_chunk_parts: EdgesDataReference,
    /// Edges from sources to their children sources
    pub source_children: EdgesDataReference,
    /// Root level sources, walking their children will reach all sources
    pub source_roots: Vec<u32>,
}

struct AnalyzeOutputFileBuilder {
    output_file: AnalyzeOutputFile,
    chunk_part_indices: Vec<u32>,
}

struct AnalyzeSourceBuilder {
    source: AnalyzeSource,
    child_source_indices: Vec<u32>,
}

struct AnalyzeDataBuilder {
    sources: Vec<AnalyzeSourceBuilder>,
    source_index_map: FxHashMap<RcStr, u32>,
    chunk_parts: Vec<AnalyzeChunkPart>,
    output_files: Vec<AnalyzeOutputFileBuilder>,
}

struct EdgesDataSectionBuilder {
    data: Vec<u8>,
}

impl EdgesDataSectionBuilder {
    fn new() -> Self {
        Self { data: vec![] }
    }

    fn add_edges(&mut self, edges: &EdgesData) -> EdgesDataReference {
        let offset = self.data.len().try_into().unwrap();
        edges.write(&mut self.data).unwrap();
        let length = (self.data.len() - offset as usize).try_into().unwrap();
        EdgesDataReference { offset, length }
    }
}

impl AnalyzeDataBuilder {
    fn new() -> Self {
        Self {
            sources: vec![],
            source_index_map: FxHashMap::default(),
            chunk_parts: vec![],
            output_files: vec![],
        }
    }

    fn ensure_source(&mut self, path: &str) -> (&mut AnalyzeSourceBuilder, u32) {
        if let Some(&index) = self.source_index_map.get(path) {
            return (&mut self.sources[index as usize], index);
        }
        let index = self.sources.len() as u32;
        let path = RcStr::from(path);
        self.source_index_map.insert(path.clone(), index);
        self.sources.push(AnalyzeSourceBuilder {
            source: AnalyzeSource {
                parent_source_index: None,
                path,
                source_size: 0,
            },
            child_source_indices: vec![],
        });
        (&mut self.sources[index as usize], index)
    }

    fn add_chunk_part(&mut self, chunk_part: AnalyzeChunkPart) -> u32 {
        let i = self.chunk_parts.len() as u32;
        self.chunk_parts.push(chunk_part);
        i
    }

    fn add_output_file(&mut self, output_file: AnalyzeOutputFile) -> u32 {
        let i = self.output_files.len() as u32;
        self.output_files.push(AnalyzeOutputFileBuilder {
            output_file,
            chunk_part_indices: vec![],
        });
        i
    }

    fn add_chunk_part_to_output_file(&mut self, output_file_index: u32, chunk_part_index: u32) {
        self.output_files[output_file_index as usize]
            .chunk_part_indices
            .push(chunk_part_index);
    }

    fn build(mut self) -> Rope {
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

        let source_children = EdgesData::from_iterator(
            self.sources
                .iter_mut()
                .map(|s| take(&mut s.child_source_indices)),
        );

        let mut binary_section = EdgesDataSectionBuilder::new();

        let header = AnalyzeDataHeader {
            modules: vec![],
            sources: self.sources.into_iter().map(|s| s.source).collect(),
            chunk_parts: self.chunk_parts,
            output_files: self
                .output_files
                .into_iter()
                .map(|of| of.output_file)
                .collect(),
            layers: vec![],
            module_dependents: binary_section.add_edges(&EdgesData::default()),
            async_module_dependents: binary_section.add_edges(&EdgesData::default()),
            module_dependencies: binary_section.add_edges(&EdgesData::default()),
            async_module_dependencies: binary_section.add_edges(&EdgesData::default()),
            source_modules: binary_section.add_edges(&EdgesData::default()),
            output_file_chunk_parts: binary_section.add_edges(&EdgesData::default()),
            source_chunk_parts: binary_section.add_edges(&EdgesData::default()),
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

#[turbo_tasks::function]
pub async fn analyze_output_assets(output_assets: Vc<OutputAssets>) -> Result<Vc<FileContent>> {
    let mut builder = AnalyzeDataBuilder::new();

    // Process the output assets and extract chunk parts.
    // Also creates sources for the chunk parts.
    for &asset in output_assets.await? {
        let output_file_index = builder.add_output_file(AnalyzeOutputFile {
            filename: asset.path().to_string().owned().await?,
        });
        let chunk_parts = split_output_asset_into_parts(*asset).await?;
        for chunk_part in chunk_parts {
            let source_index = builder.ensure_source(&chunk_part.source).1;
            builder.add_chunk_part(AnalyzeChunkPart {
                source_index,
                output_file_index,
                size: chunk_part.real_size + chunk_part.unaccounted_size,
            });
            builder.add_chunk_part_to_output_file(output_file_index, source_index);
        }
    }

    // Build a directory structure for the sources.
    let mut i: u32 = 0;
    let len = builder.sources.len().try_into().unwrap();
    while i < len {
        let source = &builder.sources[i as usize];
        let path = source.source.path.clone();
        if let Some(pos) = path.rfind('/') {
            let parent_path = &path[..pos + 1];
            let (parent_source, parent_index) = builder.ensure_source(parent_path);
            parent_source.child_source_indices.push(i);
            builder.sources[i as usize].source.parent_source_index = Some(parent_index);
        }
        i += 1;
    }

    let rope = builder.build();
    Ok(FileContent::Content(File::from(rope)).cell())
}

#[turbo_tasks::function]
pub async fn analyze_endpoint(endpoint: Vc<Box<dyn Endpoint>>) -> Result<Vc<FileContent>> {
    Ok(analyze_output_assets(
        *endpoint.output().await?.output_assets,
    ))
}

#[turbo_tasks::value]
pub struct AnalyzeDataOutputAsset {
    pub path: FileSystemPath,
    pub output_assets: ResolvedVc<OutputAssets>,
}

#[turbo_tasks::value_impl]
impl AnalyzeDataOutputAsset {
    #[turbo_tasks::function]
    pub async fn new(path: FileSystemPath, output_assets: Vc<OutputAssets>) -> Result<Vc<Self>> {
        Ok(Self {
            path,
            output_assets: output_assets.to_resolved().await?,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl Asset for AnalyzeDataOutputAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        let file_content = analyze_output_assets(*self.output_assets);
        AssetContent::file(file_content)
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for AnalyzeDataOutputAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        self.path.clone().cell()
    }
}
