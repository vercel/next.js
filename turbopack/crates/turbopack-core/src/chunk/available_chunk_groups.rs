use turbo_tasks::Vc;
use turbo_tasks_hash::Xxh3Hash64Hasher;

use crate::module_graph::chunk_group_info::RoaringBitmapWrapper;

/// Chunk groups whose content is already available.
///
/// Whether an individual module is available is derived by intersecting this bitmap with the
/// module's chunk group membership bitmap.
#[turbo_tasks::value(transparent)]
#[derive(Clone, Debug)]
pub struct AvailableChunkGroups(pub RoaringBitmapWrapper);

#[turbo_tasks::value_impl]
impl AvailableChunkGroups {
    #[turbo_tasks::function]
    pub fn new(chunk_group: u32) -> Vc<Self> {
        let mut chunk_groups = RoaringBitmapWrapper::default();
        chunk_groups.insert(chunk_group);
        Vc::cell(chunk_groups)
    }

    #[turbo_tasks::function]
    pub fn with_chunk_group(&self, chunk_group: u32) -> Vc<Self> {
        let mut chunk_groups = self.0.clone();
        chunk_groups.insert(chunk_group);
        Vc::cell(chunk_groups)
    }

    #[turbo_tasks::function]
    pub fn hash(&self) -> Vc<u64> {
        let mut hasher = Xxh3Hash64Hasher::new();
        for chunk_group in self.0.iter() {
            hasher.write_value(chunk_group);
        }
        Vc::cell(hasher.finish())
    }
}
