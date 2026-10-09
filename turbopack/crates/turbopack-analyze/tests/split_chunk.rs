#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this
#![cfg(test)]

use anyhow::Result;
use serde_json::json;
use turbo_rcstr::rcstr;
use turbo_tasks::{OperationVc, ResolvedVc, Vc};
use turbo_tasks_fs::{
    File, FileContent, FileSystem, FileSystemPath, VirtualFileSystem, rope::Rope,
};
use turbo_tasks_testing::{Registration, register, run_once};
use turbopack_analyze::split_chunk::{ChunkPartRange, ChunkParts, split_output_asset_into_parts};
use turbopack_core::{
    asset::{Asset, AssetContent},
    code_builder::{Code, CodeBuilder},
    output::{OutputAsset, OutputAssetsReference},
    source_map::{GenerateSourceMap, SourceMapGeneration, SourceMapType},
};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn split_chunk() {
    run_once(&REGISTRATION, async || {
        let mut code = CodeBuilder::new(
            SourceMapGeneration {
                full: true,
                partial: true,
            },
            false,
        );
        code += "Hello world!\n";
        code += "This is a test file.\n";
        code.push_source(
            &Rope::from("Hello world!\n123"),
            Some(Rope::from(serde_json::to_string_pretty(&json! ({
                "version": 3,
                "mappings": "AAAA;AACA",
                "sources": ["original-source1.js"],
                "names": [],
                "sourcesContent": ["console.log('Hello world!');"]
            }))?)),
            Some(Rope::from(serde_json::to_string_pretty(&json! ({
                "version": 3,
                "mappings": "AAAA;AACA",
                "sources": ["source1.js"],
                "names": [],
                "sourcesContent": ["console.log('Hello world!');"]
            }))?)),
        );
        code += "This is the middle of the file.\n";
        code.push_source(
            &Rope::from("This is the middle of the file.\n"),
            Some(Rope::from(serde_json::to_string_pretty(&json! ({
                "version": 3,
                "mappings": "AAAA",
                "sources": ["original-source2.js"],
                "names": [],
                "sourcesContent": ["console.log('Middle of file');"]
            }))?)),
            Some(Rope::from(serde_json::to_string_pretty(&json! ({
                "version": 3,
                "mappings": "AAAA",
                "sources": ["source2.js"],
                "names": [],
                "sourcesContent": ["console.log('Middle of file');"]
            }))?)),
        );
        code += "This is the end of the file.\n";
        let code = code.build();
        let full_map = code.generate_source_map_ref(None, SourceMapType::Full);
        let partial_map = code.generate_source_map_ref(None, SourceMapType::Partial);
        assert_ne!(full_map, partial_map);
        let copied_code = CodeBuilder::from(code.clone()).build();
        for ty in [SourceMapType::Full, SourceMapType::Partial] {
            assert_eq!(
                code.generate_source_map_ref(None, ty),
                copied_code.generate_source_map_ref(None, ty)
            );
        }

        let asset = TestAsset {
            code: code.resolved_cell(),
        }
        .resolved_cell();

        #[turbo_tasks::function(operation, root)]
        fn split_parts_operation(asset: ResolvedVc<TestAsset>) -> Vc<ChunkParts> {
            split_output_asset_into_parts(Vc::upcast(*asset))
        }

        let parts_op = split_parts_operation(asset);
        let parts = parts_op.read_strongly_consistent().await?;

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

        #[turbo_tasks::function(operation, root)]
        async fn compressed_size_operation(
            parts: OperationVc<ChunkParts>,
            index: usize,
        ) -> Result<Vc<u32>> {
            Ok(Vc::cell(
                parts.connect().await?[index]
                    .get_compressed_size()
                    .await?
                    .unwrap(),
            ))
        }

        let compressed_size_0 = compressed_size_operation(parts_op, 0)
            .read_strongly_consistent()
            .await?;
        let compressed_size_1 = compressed_size_operation(parts_op, 1)
            .read_strongly_consistent()
            .await?;
        assert_eq!(*compressed_size_0, 43);
        assert_eq!(*compressed_size_1, 28);

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[test]
fn requested_map_sets_preserve_code_and_maps() -> Result<()> {
    let full_map = Rope::from(
        r#"{"version":3,"sources":["original.ts"],"sourcesContent":["original"],"names":[],"mappings":"AAAA"}"#,
    );
    let partial_map = Rope::from(
        r#"{"version":3,"sources":["module.js"],"sourcesContent":["module"],"names":[],"mappings":"AAAA"}"#,
    );
    for emitted in [
        None,
        Some(SourceMapType::Partial),
        Some(SourceMapType::Full),
    ] {
        let mut outputs = Vec::new();
        for analyze in [false, true] {
            let mut generation = SourceMapGeneration::from_emitted(emitted);
            generation.partial |= analyze;
            let mut source = CodeBuilder::new(generation, true);
            source.push_source(
                &Rope::from("module();\n"),
                Some(full_map.clone()),
                Some(partial_map.clone()),
            );
            let mut chunk = CodeBuilder::new(generation, true);
            chunk += "wrapper();\n";
            chunk.push_code(&source.build());
            chunk += "footer();\n";
            let code = CodeBuilder::from(chunk.build()).build();
            assert!(code.should_generate_debug_id());
            assert_eq!(
                code.has_source_map_for(SourceMapType::Full),
                emitted == Some(SourceMapType::Full)
            );
            assert_eq!(
                code.has_source_map_for(SourceMapType::Partial),
                analyze || emitted == Some(SourceMapType::Partial)
            );
            outputs.push(code);
        }
        assert_eq!(outputs[0].source_code(), outputs[1].source_code());
        if let Some(ty) = emitted {
            assert_eq!(
                outputs[0].generate_source_map_ref(None, ty),
                outputs[1].generate_source_map_ref(None, ty)
            );
        }
    }
    Ok(())
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
