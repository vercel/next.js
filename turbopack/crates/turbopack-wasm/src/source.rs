use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, NonLocalValue, ResolvedVc, TaskInput, Vc};
use turbo_tasks_fs::{File, FileContent};
use turbopack_core::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    source::Source,
};

#[derive(
    PartialOrd,
    Ord,
    Eq,
    PartialEq,
    Hash,
    Debug,
    Copy,
    Clone,
    Serialize,
    Deserialize,
    TaskInput,
    TraceRawVcs,
    NonLocalValue,
)]
pub enum WebAssemblySourceType {
    /// Binary WebAssembly files (.wasm).
    Binary,
    /// WebAssembly text format (.wat).
    Text,
}

/// Returns the raw binary WebAssembly source or the assembled version of a text
/// format source.
#[turbo_tasks::value]
#[derive(Clone)]
pub struct WebAssemblySource {
    source: ResolvedVc<Box<dyn Source>>,
    source_ty: WebAssemblySourceType,
}

#[turbo_tasks::value_impl]
impl WebAssemblySource {
    #[turbo_tasks::function]
    pub fn new(source: ResolvedVc<Box<dyn Source>>, source_ty: WebAssemblySourceType) -> Vc<Self> {
        Self::cell(WebAssemblySource { source, source_ty })
    }
}

#[turbo_tasks::value_impl]
impl Source for WebAssemblySource {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        match self.source_ty {
            WebAssemblySourceType::Binary => self.source.ident(),
            WebAssemblySourceType::Text => self
                .source
                .ident()
                .with_path(self.source.ident().path().append("_.wasm".into())),
        }
    }
}

#[turbo_tasks::value_impl]
impl Asset for WebAssemblySource {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let content = match self.source_ty {
            WebAssemblySourceType::Binary => return Ok(self.source.content()),
            WebAssemblySourceType::Text => self.source.content(),
        };

        let content = content.file_content().await?;

        let FileContent::Content(file) = &*content else {
            return Ok(AssetContent::file(FileContent::NotFound.cell()));
        };

        let bytes = file.content().to_bytes()?;
        let parsed = wat::parse_bytes(&bytes)?;

        Ok(AssetContent::file(File::from(&*parsed).into()))
    }
}
