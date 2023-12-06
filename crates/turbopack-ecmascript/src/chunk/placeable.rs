use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_fs::{FileJsonContent, FileSystemPath};
use turbopack_core::{
    asset::Asset,
    chunk::ChunkableModule,
    module::Module,
    resolve::{find_context_file, package_json, FindContextFileResult},
};

use crate::references::{
    async_module::OptionAsyncModule,
    esm::{EsmExport, EsmExports},
};

#[turbo_tasks::value_trait]
pub trait EcmascriptChunkPlaceable: ChunkableModule + Module + Asset {
    fn get_exports(self: Vc<Self>) -> Vc<EcmascriptExports>;
    fn get_async_module(self: Vc<Self>) -> Vc<OptionAsyncModule> {
        Vc::cell(None)
    }
    fn is_marked_as_side_effect_free(self: Vc<Self>) -> Vc<bool> {
        is_marked_as_side_effect_free(self.ident().path())
    }
}

#[turbo_tasks::function]
pub async fn is_marked_as_side_effect_free(path: Vc<FileSystemPath>) -> Result<Vc<bool>> {
    let find_package_json: turbo_tasks::ReadRef<FindContextFileResult> =
        find_context_file(path.parent(), package_json()).await?;

    if let FindContextFileResult::Found(package_json, _) = *find_package_json {
        if let FileJsonContent::Content(content) = &*package_json.read_json().await? {
            if let Some(side_effects) = content.get("sideEffects") {
                if let Some(side_effects) = side_effects.as_bool() {
                    return Ok(Vc::cell(!side_effects));
                } else {
                    // TODO it might be a glob too, handle that case too
                }
            }
        }
    }

    Ok(Vc::cell(false))
}

#[turbo_tasks::value(transparent)]
pub struct EcmascriptChunkPlaceables(Vec<Vc<Box<dyn EcmascriptChunkPlaceable>>>);

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceables {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(Vec::new())
    }
}

#[turbo_tasks::value(shared)]
pub enum EcmascriptExports {
    EsmExports(Vc<EsmExports>),
    DynamicNamespace,
    CommonJs,
    Value,
    None,
}

#[turbo_tasks::value_impl]
impl EcmascriptExports {
    #[turbo_tasks::function]
    pub async fn needs_facade(&self) -> Result<Vc<bool>> {
        Ok(match self {
            EcmascriptExports::EsmExports(exports) => {
                let exports = exports.await?;
                let has_reexports = !exports.star_exports.is_empty()
                    || exports.exports.iter().any(|(_, export)| {
                        matches!(
                            export,
                            EsmExport::ImportedBinding(..) | EsmExport::ImportedNamespace(_)
                        )
                    });
                Vc::cell(has_reexports)
            }
            _ => Vc::cell(false),
        })
    }
}
