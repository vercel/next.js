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
    source_map::{GenerateSourceMap, SourceMapType, SourceMaps},
};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn split_chunk() {
    run_once(&REGISTRATION, async || {
        let mut code = CodeBuilder::new(false);
        code += "Hello world!\n";
        code += "This is a test file.\n";
        code.push_source(
            &Rope::from("Hello world!\n123"),
            SourceMaps::new(
                Some(Rope::from(serde_json::to_string(&json!({
                    "version": 3,
                    "mappings": "AAAA",
                    "sources": ["original-source.ts"],
                    "names": []
                }))?)),
                Some(Rope::from(serde_json::to_string_pretty(&json! ({
                    "version": 3,
                    "mappings": "AAAA;AACA",
                    "sources": ["source1.js"],
                    "names": [],
                    "sourcesContent": ["console.log('Hello world!');"]
                }))?)),
            ),
        );
        code += "This is the middle of the file.\n";
        code.push_source(
            &Rope::from("This is the middle of the file.\n"),
            SourceMaps::new(
                Some(Rope::from(serde_json::to_string(&json!({
                    "version": 3,
                    "mappings": "AAAA",
                    "sources": ["original-source.ts"],
                    "names": []
                }))?)),
                Some(Rope::from(serde_json::to_string_pretty(&json! ({
                    "version": 3,
                    "mappings": "AAAA",
                    "sources": ["source2.js"],
                    "names": [],
                    "sourcesContent": ["console.log('Middle of file');"]
                }))?)),
            ),
        );
        code += "This is the end of the file.\n";
        let code = code.build();

        let mut combined = CodeBuilder::new(false);
        combined.push_code(&code);
        let code = combined.build();
        assert!(
            code.generate_source_map_ref(None, SourceMapType::Full)?
                .to_str()?
                .contains("original-source.ts")
        );
        assert!(
            !code
                .generate_source_map_ref(None, SourceMapType::Partial)?
                .to_str()?
                .contains("original-source.ts")
        );

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
    pub fn generate_source_map(&self, ty: SourceMapType) -> Vc<FileContent> {
        self.code.generate_source_map(ty)
    }
}

#[test]
fn rejects_missing_source_map_variants() {
    let mut partial = CodeBuilder::new(false);
    partial.push_source(
        &Rope::from("partial"),
        SourceMaps::new(
            None,
            Some(turbopack_core::source_map::SourceMap::empty_rope()),
        ),
    );
    let partial = partial.build();
    assert!(
        partial
            .generate_source_map_ref(None, SourceMapType::Full)
            .is_err()
    );
    assert!(
        partial
            .generate_source_map_ref(None, SourceMapType::Partial)
            .is_ok()
    );

    let mut combined = CodeBuilder::new(false);
    combined += "synthetic prefix";
    combined.push_code(&partial);
    let combined = combined.build();
    assert!(
        combined
            .generate_source_map_ref(None, SourceMapType::Full)
            .is_err()
    );

    let mut incompatible = CodeBuilder::new(false);
    incompatible.push_code(&combined);
    incompatible.push_source(
        &Rope::from("full"),
        SourceMaps::new(
            Some(turbopack_core::source_map::SourceMap::empty_rope()),
            None,
        ),
    );
    let incompatible = incompatible.build();
    assert!(
        incompatible
            .generate_source_map_ref(None, SourceMapType::Full)
            .is_err()
    );
    assert!(
        incompatible
            .generate_source_map_ref(None, SourceMapType::Partial)
            .is_err()
    );
}

#[test]
fn shared_maps_survive_concatenation() -> anyhow::Result<()> {
    let mut source = CodeBuilder::new(false);
    source.push_source(
        &Rope::from("const value = 1;"),
        SourceMaps::Shared(turbopack_core::source_map::SourceMap::empty_rope()),
    );
    let mut combined = CodeBuilder::new(false);
    combined += "prefix";
    combined.push_code(&source.build());
    combined += "suffix";
    let combined = combined.build();
    assert!(matches!(combined.source_maps()?, SourceMaps::Shared(_)));
    assert_eq!(
        combined.generate_source_map_ref(None, SourceMapType::Full)?,
        combined.generate_source_map_ref(None, SourceMapType::Partial)?,
    );
    Ok(())
}

#[test]
fn shared_maps_split_when_variants_diverge() -> anyhow::Result<()> {
    let mut code = CodeBuilder::new(false);
    code.push_source(
        &Rope::from("shared"),
        SourceMaps::Shared(turbopack_core::source_map::SourceMap::empty_rope()),
    );
    code.push_source(
        &Rope::from("partial"),
        SourceMaps::Partial(turbopack_core::source_map::SourceMap::empty_rope()),
    );
    let code = code.build();
    assert!(
        code.generate_source_map_ref(None, SourceMapType::Full)
            .is_err()
    );
    assert!(matches!(code.source_maps()?, SourceMaps::Partial(_)));
    Ok(())
}

#[test]
fn concatenation_preserves_variant_offsets_and_synthetic_sections() -> Result<()> {
    let full = json!({
        "version": 3,
        "mappings": "AAAA",
        "sources": ["original.ts"],
        "names": [],
    });
    let partial = json!({
        "version": 3,
        "mappings": "AAAA",
        "sources": ["input.js"],
        "names": [],
    });
    let shared = json!({
        "version": 3,
        "mappings": "AAAA",
        "sources": ["shared.js"],
        "names": [],
    });
    let mut source = CodeBuilder::new(false);
    source += "prefix ";
    source.push_source(
        &Rope::from("mapped"),
        SourceMaps::Both {
            full: Rope::from(serde_json::to_string(&full)?),
            partial: Rope::from(serde_json::to_string(&partial)?),
        },
    );
    let mut combined = CodeBuilder::new(false);
    combined.push_source(
        &Rope::from("shared"),
        SourceMaps::Shared(Rope::from(serde_json::to_string(&shared)?)),
    );
    combined.push_code(&source.build());
    combined.push_code(&CodeBuilder::new(false).build());
    combined += "suffix";
    let combined = combined.build();

    for (ty, map) in [
        (SourceMapType::Full, full),
        (SourceMapType::Partial, partial),
    ] {
        let generated = combined.generate_source_map_ref(None, ty)?;
        let generated: serde_json::Value = serde_json::from_slice(&generated.to_bytes())?;
        assert_eq!(
            generated["sections"],
            json!([
                { "offset": { "line": 0, "column": 0 }, "map": shared },
                { "offset": { "line": 0, "column": 6 }, "map": {
                    "version": 3, "sources": [], "names": [], "mappings": "A",
                } },
                { "offset": { "line": 0, "column": 13 }, "map": map },
                { "offset": { "line": 0, "column": 19 }, "map": {
                    "version": 3, "sources": [], "names": [], "mappings": "A",
                } },
            ])
        );
    }
    Ok(())
}
