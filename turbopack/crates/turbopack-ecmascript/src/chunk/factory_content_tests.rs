//! Chunk sizing and code generation go through one entry point,
//! [`chunk_item_factory_content`](super::item::chunk_item_factory_content): they share the per-item
//! minification, size raw content outside per-item mode, and handle a failed content differently
//! (sizing counts it as empty, code generation reports it and emits a throwing factory).

use anyhow::{Result, bail};
use async_trait::async_trait;
use turbo_tasks::{OperationVc, ReadRef, ResolvedVc, Vc};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
use turbo_tasks_fs::{FileSystem, VirtualFileSystem};
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkItem, ChunkType, ChunkingContext, MinifyType, round_chunk_item_size,
    },
    ident::AssetIdent,
    issue::{CollectibleIssuesExt, IssueFilter},
    module::Module,
    output::OutputAssetsReference,
};

use crate::chunk::{
    EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemExt, EcmascriptChunkType,
    chunk_type::{estimated_chunk_item_size, rounded_chunk_item_size},
    item::{ChunkItemFactoryContent, chunk_item_factory_content},
};

const CODE: &str = "(() => {\n  const value = 1 + 2;\n  console.log(value);\n})";

/// A chunk item whose content is [`CODE`] (the same cell whether estimated or not), or fails to
/// generate.
#[turbo_tasks::value]
struct TestItem {
    ident: ResolvedVc<AssetIdent>,
    fails: bool,
}

#[turbo_tasks::function]
fn test_content() -> Vc<EcmascriptChunkItemContent> {
    EcmascriptChunkItemContent {
        inner_code: CODE.into(),
        ..Default::default()
    }
    .cell()
}

#[turbo_tasks::function]
async fn test_item(fails: bool) -> Result<Vc<Box<dyn EcmascriptChunkItem>>> {
    let path = VirtualFileSystem::new().root().await?.join("item.js")?;
    Ok(Vc::upcast(
        TestItem {
            ident: AssetIdent::from_path(path).into_vc().to_resolved().await?,
            fails,
        }
        .cell(),
    ))
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for TestItem {}

#[turbo_tasks::value_impl]
impl ChunkItem for TestItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        *self.ident
    }

    fn ty(&self) -> Vc<Box<dyn ChunkType>> {
        Vc::upcast(Vc::<EcmascriptChunkType>::default())
    }

    #[turbo_tasks::function]
    fn module(&self) -> Result<Vc<Box<dyn Module>>> {
        bail!("not needed by the tests")
    }

    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        unreachable!("not needed by the tests")
    }
}

#[async_trait]
#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for TestItem {
    async fn content_with_async_module_info(
        &self,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        if self.fails {
            bail!("the content failed to generate");
        }
        Ok(test_content())
    }
}

const MINIFY: MinifyType = MinifyType::Minify { mangle: None };

#[turbo_tasks::value(shared, serialization = "skip")]
struct Sizes {
    /// The estimated and final contents' minified factories are the same cell.
    shared_minification: bool,
    minified_size: usize,
    minified_code: String,
    raw_size: usize,
    /// What chunking sees outside per-item mode.
    rounded_raw_size: usize,
}

#[turbo_tasks::function(operation, root)]
async fn sizes_operation() -> Result<Vc<Sizes>> {
    let item = test_item(false).to_resolved().await?;
    let factory = async |estimated| -> Result<_> {
        let ChunkItemFactoryContent::Minified { factory, .. } =
            chunk_item_factory_content(item, None, estimated, MINIFY, false).await?
        else {
            bail!("per-item minification minifies the item");
        };
        factory.to_resolved().await
    };
    let estimated = factory(true).await?;
    let final_factory = factory(false).await?;
    Ok(Sizes {
        shared_minification: estimated == final_factory,
        minified_size: estimated_chunk_item_size(item, None, MINIFY, false).await?,
        minified_code: final_factory.await?.source_code().to_str()?.into_owned(),
        raw_size: estimated_chunk_item_size(item, None, MinifyType::NoMinify, false).await?,
        rounded_raw_size: rounded_chunk_item_size(item, None, MinifyType::NoMinify, false).await,
    }
    .cell())
}

#[turbo_tasks::value(shared, serialization = "skip")]
struct Failure {
    /// What chunking sees for the item.
    size: usize,
    factory: String,
}

/// The result of `op`, and the titles of the issues it emitted.
#[turbo_tasks::value(shared, serialization = "skip")]
struct WithIssues {
    failure: ReadRef<Failure>,
    issues: Vec<String>,
}

#[turbo_tasks::function(operation, root)]
async fn with_issues_operation(op: OperationVc<Failure>) -> Result<Vc<WithIssues>> {
    let failure = op.read_strongly_consistent().await?;
    let issues = op
        .peek_issues()
        .get_plain_issues(&IssueFilter::everything())
        .await?
        .iter()
        .map(|issue| issue.title.to_unstyled_string())
        .collect();
    Ok(WithIssues { failure, issues }.cell())
}

#[turbo_tasks::function(operation, root)]
async fn size_failed_operation() -> Result<Vc<Failure>> {
    let item = test_item(true).to_resolved().await?;
    Ok(Failure {
        size: rounded_chunk_item_size(item, None, MINIFY, false).await,
        factory: String::new(),
    }
    .cell())
}

#[turbo_tasks::function(operation, root)]
async fn code_failed_operation() -> Result<Vc<Failure>> {
    let code = test_item(true).code(None).await?;
    Ok(Failure {
        size: 0,
        factory: code
            .code
            .to_code()
            .await?
            .source_code()
            .to_str()?
            .into_owned(),
    }
    .cell())
}

async fn run(f: impl Future<Output = Result<()>> + Send + 'static) {
    turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
        BackendOptions::default(),
        noop_backing_storage(),
    ))
    .run_once(f)
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn estimated_and_final_content_share_one_minification() {
    run(async {
        let sizes = sizes_operation().read_strongly_consistent().await?;
        assert!(sizes.shared_minification);
        assert_eq!(sizes.minified_size, sizes.minified_code.len());
        assert!(sizes.minified_size < CODE.len(), "{}", sizes.minified_code);
        // Not minified per item: the raw code, without the factory wrapper.
        assert_eq!(sizes.raw_size, CODE.len());
        assert_eq!(sizes.rounded_raw_size, round_chunk_item_size(CODE.len()));
        Ok(())
    })
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn failed_content_sizes_as_empty_but_code_generation_reports_it() {
    run(async {
        let size = with_issues_operation(size_failed_operation())
            .read_strongly_consistent()
            .await?;
        assert_eq!(size.failure.size, 0);
        assert!(
            size.issues.is_empty(),
            "sizing must not report: {:?}",
            size.issues
        );

        let code_result = with_issues_operation(code_failed_operation())
            .read_strongly_consistent()
            .await?;
        let code = &code_result.failure;
        assert!(
            code.factory.contains("throw new Error(")
                && code.factory.contains("the content failed to generate"),
            "{}",
            code.factory
        );
        assert!(
            code_result
                .issues
                .iter()
                .any(|title| title.contains("Code generation")),
            "{:?}",
            code_result.issues
        );
        Ok(())
    })
    .await;
}
