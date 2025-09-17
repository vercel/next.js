use std::io::{Read, Write};

use anyhow::{Result, bail};
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{FileContent, glob::Glob, rope::RopeBuilder};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkItem, ChunkType, ChunkableModule, ChunkingContext},
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
    source::Source,
};

use crate::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkType, EcmascriptExports,
    },
    runtime_functions::TURBOPACK_EXPORT_VALUE,
    utils::StringifyJs,
};

#[turbo_tasks::value]
pub struct InlinedBytesJsModule {
    source: ResolvedVc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl InlinedBytesJsModule {
    #[turbo_tasks::function]
    pub fn new(source: ResolvedVc<Box<dyn Source>>) -> Vc<Self> {
        Self::cell(InlinedBytesJsModule { source })
    }
}

#[turbo_tasks::value_impl]
impl Module for InlinedBytesJsModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source
            .ident()
            .with_modifier(rcstr!("static bytes in ecmascript"))
    }
}

#[turbo_tasks::value_impl]
impl Asset for InlinedBytesJsModule {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for InlinedBytesJsModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        _module_graph: Vc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        Vc::upcast(InlinedBytesJsChunkItem::cell(InlinedBytesJsChunkItem {
            module: self,
            chunking_context,
        }))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for InlinedBytesJsModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }

    #[turbo_tasks::function]
    fn is_marked_as_side_effect_free(&self, _side_effect_free_packages: Vc<Glob>) -> Vc<bool> {
        Vc::cell(true)
    }
}

#[turbo_tasks::value]
struct InlinedBytesJsChunkItem {
    module: ResolvedVc<InlinedBytesJsModule>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for InlinedBytesJsChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(
            Vc::<EcmascriptChunkType>::default().resolve().await?,
        ))
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        Vc::upcast(*self.module)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for InlinedBytesJsChunkItem {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<EcmascriptChunkItemContent>> {
        let content = self.module.content().file_content().await?;
        match &*content {
            FileContent::Content(data) => {
                let mut inner_code = RopeBuilder::default();
                inner_code += "
var decode = Uint8Array.fromBase64 || function Uint8Array_fromBase64(base64) {
  var binaryString = atob(base64);
  var buffer = new Uint8Array(binaryString.length);
  for (var i = 0; i < binaryString.length; i++) {
    buffer[i] = binaryString.charCodeAt(i)
  }
  return buffer
};\n";

                let encoded = data_encoding::BASE64_NOPAD
                    .encode(&data.read().bytes().collect::<std::io::Result<Vec<u8>>>()?);
                write!(
                    inner_code,
                    "{TURBOPACK_EXPORT_VALUE}(decode({}));",
                    StringifyJs(&encoded)
                )?;

                Ok(EcmascriptChunkItemContent {
                    inner_code: inner_code.build(),
                    ..Default::default()
                }
                .into())
            }
            FileContent::NotFound => {
                bail!("File not found: {}", self.module.ident().to_string().await?);
            }
        }
    }
}
