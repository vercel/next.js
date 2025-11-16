#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this
#![cfg(test)]

use anyhow::Result;
use serde_json::json;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileSystem, FileSystemPath, VirtualFileSystem, rope::Rope};
use turbo_tasks_testing::{Registration, register, run_once};
use turbopack_analyze::split_chunk::{ChunkPart, ChunkPartRange, split_output_asset_into_parts};
use turbopack_core::{
    asset::{Asset, AssetContent},
    code_builder::{Code, CodeBuilder},
    output::{OutputAsset, OutputAssetsReference},
    source_map::{GenerateSourceMap, OptionStringifiedSourceMap},
};

static REGISTRATION: Registration = register!(turbo_tasks_fetch::register);

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn split_chunk() {
    run_once(&REGISTRATION, || async {
        let mut code = CodeBuilder::new(true, false);
        code += "Hello world!\n";
        code += "This is a test file.\n";
        code.push_source(
            &Rope::from("Hello world!\n123"),
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
                "sources": ["source2.js"],
                "names": [],
                "sourcesContent": ["console.log('Middle of file');"]
            }))?)),
        );
        code += "This is the end of the file.\n";
        let code = code.build();

        let asset = Vc::upcast(
            TestAsset {
                code: code.resolved_cell(),
            }
            .cell(),
        );

        let parts = split_output_asset_into_parts(asset).await.unwrap();

        assert_eq!(
            &*parts,
            &vec![
                ChunkPart {
                    source: rcstr!("source1.js"),
                    real_size: 15,
                    unaccounted_size: 51,
                    ranges: vec![
                        ChunkPartRange {
                            line: 2,
                            start_column: 0,
                            end_column: 12,
                        },
                        ChunkPartRange {
                            line: 3,
                            start_column: 0,
                            end_column: 3,
                        },
                    ],
                },
                ChunkPart {
                    source: rcstr!("source2.js"),
                    real_size: 31,
                    unaccounted_size: 46,
                    ranges: vec![ChunkPartRange {
                        line: 4,
                        start_column: 0,
                        end_column: 31,
                    }],
                },
            ]
        );

        println!("{:#?}", parts);
        anyhow::Ok(())
    })
    .await
    .unwrap()
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
            File::from(self.code.await?.source_code().clone()).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for TestAsset {
    #[turbo_tasks::function]
    pub fn generate_source_map(&self) -> Vc<OptionStringifiedSourceMap> {
        self.code.generate_source_map()
    }
}
