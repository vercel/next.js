#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this
#![cfg(test)]

use anyhow::Result;
use serde_json::json;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{
    File, FileContent, FileSystem, FileSystemPath, VirtualFileSystem, rope::Rope,
};
use turbo_tasks_testing::{Registration, register, run_once};
use turbopack_analyze::split_chunk::{ChunkPart, ChunkPartRange, split_output_asset_into_parts};
use turbopack_core::{
    asset::{Asset, AssetContent},
    code_builder::{Code, CodeBuilder},
    output::{OutputAsset, OutputAssetsReference},
    source_map::{GenerateSourceMap, SourceMapGenerationOptions, SourceMapType, SourceMaps},
};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn split_chunk() {
    run_once(&REGISTRATION, async || {
        let mut code = CodeBuilder::new(
            SourceMapGenerationOptions {
                full: false,
                partial: true,
            },
            false,
        );
        code += "Hello world!\n";
        code += "This is a test file.\n";
        code.push_source(
            &Rope::from("Hello world!\n123"),
            SourceMaps {
                full: None,
                partial: Some(Rope::from(serde_json::to_string_pretty(&json! ({
                    "version": 3,
                    "mappings": "AAAA;AACA",
                    "sources": ["source1.js"],
                    "names": [],
                    "sourcesContent": ["console.log('Hello world!');"]
                }))?)),
            },
        );
        code += "This is the middle of the file.\n";
        code.push_source(
            &Rope::from("This is the middle of the file.\n"),
            SourceMaps {
                full: None,
                partial: Some(Rope::from(serde_json::to_string_pretty(&json! ({
                    "version": 3,
                    "mappings": "AAAA",
                    "sources": ["source2.js"],
                    "names": [],
                    "sourcesContent": ["console.log('Middle of file');"]
                }))?)),
            },
        );
        code += "This is the end of the file.\n";
        let code = code.build();

        let asset = TestAsset {
            code: code.resolved_cell(),
        }
        .resolved_cell();

        let result = split_parts_operation(asset)
            .read_strongly_consistent()
            .await?;
        let parts = &result.parts;

        assert_eq!(parts.len(), 2);

        assert_eq!(parts[0].source, rcstr!("source1.js"));
        assert_eq!(parts[0].real_size, 46);
        assert_eq!(parts[0].unaccounted_size, 34);
        assert_eq!(
            parts[0].ranges,
            vec![
                ChunkPartRange {
                    line: 2,
                    start_column: 0,
                    end_column: 12
                },
                ChunkPartRange {
                    line: 3,
                    start_column: 0,
                    end_column: 34
                },
            ]
        );

        assert_eq!(parts[1].source, rcstr!("source2.js"));
        assert_eq!(parts[1].real_size, 31);
        assert_eq!(parts[1].unaccounted_size, 30);
        assert_eq!(
            parts[1].ranges,
            vec![ChunkPartRange {
                line: 4,
                start_column: 0,
                end_column: 31
            }]
        );

        assert_eq!(result.compressed_sizes, [Some(43), Some(28)]);

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::value]
struct SplitResult {
    parts: Vec<ChunkPart>,
    compressed_sizes: Vec<Option<u32>>,
}

#[turbo_tasks::function(operation, root)]
async fn split_parts_operation(asset: ResolvedVc<TestAsset>) -> Result<Vc<SplitResult>> {
    let parts = split_output_asset_into_parts(Vc::upcast(*asset)).await?;
    let mut compressed_sizes = Vec::with_capacity(parts.len());
    for part in &parts {
        compressed_sizes.push(part.get_compressed_size().await?);
    }
    Ok(SplitResult {
        parts,
        compressed_sizes,
    }
    .cell())
}

#[turbo_tasks::value]
struct TestAsset {
    code: ResolvedVc<Code>,
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for TestAsset {}

#[turbo_tasks::value_impl]
impl OutputAsset for TestAsset {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<Vc<FileSystemPath>> {
        Ok(VirtualFileSystem::new()
            .root()
            .await?
            .join("test.js")?
            .cell())
    }
}

#[turbo_tasks::value_impl]
impl Asset for TestAsset {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        Ok(AssetContent::file(
            FileContent::Content(File::from(self.code.await?.source_code().clone())).cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for TestAsset {
    #[turbo_tasks::function]
    pub fn generate_source_map(&self, ty: Vc<SourceMapType>) -> Vc<FileContent> {
        self.code.generate_source_map(ty)
    }
}
