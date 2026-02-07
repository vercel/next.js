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
use turbopack_analyze::split_chunk::{ChunkPartRange, split_output_asset_into_parts};
use turbopack_core::{
    asset::{Asset, AssetContent},
    code_builder::{Code, CodeBuilder},
    output::{OutputAsset, OutputAssetsReference},
    source_map::GenerateSourceMap,
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

        assert_eq!(parts[0].get_compressed_size().await.unwrap(), 43);
        assert_eq!(parts[1].get_compressed_size().await.unwrap(), 28);

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
            FileContent::Content(File::from(self.code.await?.source_code().clone())).cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for TestAsset {
    #[turbo_tasks::function]
    pub fn generate_source_map(&self) -> Vc<FileContent> {
        self.code.generate_source_map()
    }
}
