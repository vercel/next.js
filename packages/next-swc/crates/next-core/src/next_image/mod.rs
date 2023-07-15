pub(crate) mod content_source;
pub(crate) mod module;
pub(crate) mod source_asset;

pub use content_source::NextImageContentSource;
pub use module::StructuredImageModuleType;
use turbo_tasks::Vc;
