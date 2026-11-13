use std::hash::{Hash, Hasher};

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ReadRef, ResolvedVc, TryJoinIterExt, Vc, turbobail};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::{DeterministicHasher, Xxh3Hash64Hasher, encode_base64};
use turbopack_core::{chunk::ModuleId, version::Version};

use crate::{
    chunk::{EcmascriptChunkContent, EcmascriptChunkContentEntries},
    emit_options::EcmascriptEmitOptions,
};

/// Adapts [`Xxh3Hash64Hasher`] to the [`std::hash::Hasher`] trait so that types that only
/// implement [`std::hash::Hash`] (such as the SWC minify options inside
/// [`EcmascriptEmitOptions`]) can feed a stable version hash.
///
/// The standard default integer methods use native byte order and pointer width, so integers are
/// normalized to little-endian, with `usize` / `isize` widened to 64 bits.
struct Xxh3StdHasher(Xxh3Hash64Hasher);

macro_rules! write_le {
    ($($method:ident: $ty:ty),* $(,)?) => {
        $(
            fn $method(&mut self, i: $ty) {
                self.write(&i.to_le_bytes());
            }
        )*
    };
}

impl Hasher for Xxh3StdHasher {
    fn write(&mut self, bytes: &[u8]) {
        self.0.write_bytes(bytes);
    }

    write_le!(
        write_u16: u16,
        write_u32: u32,
        write_u64: u64,
        write_u128: u128,
        write_i16: i16,
        write_i32: i32,
        write_i64: i64,
        write_i128: i128,
    );

    fn write_usize(&mut self, i: usize) {
        self.write_u64(i as u64);
    }

    fn write_isize(&mut self, i: isize) {
        self.write_i64(i as i64);
    }

    fn finish(&self) -> u64 {
        self.0.finish()
    }
}

/// The version of a single Ecmascript chunk's content, tracked as the set of
/// per-module content hashes.
///
/// Runtime-agnostic: the browser and node chunking contexts share this one
/// implementation rather than each carrying a copy. The ecmascript emit options
/// participate in the hash because they (e.g. minification) change the emitted
/// bytes without changing any module's own hash.
#[turbo_tasks::value(serialization = "skip")]
pub struct EcmascriptChunkVersion {
    pub chunk_path: RcStr,
    pub emit_options: Option<ReadRef<EcmascriptEmitOptions>>,
    pub entries_hashes: FxIndexMap<ModuleId, u128>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkVersion {
    #[turbo_tasks::function]
    pub async fn new(
        output_root: FileSystemPath,
        chunk_path: FileSystemPath,
        content: Vc<EcmascriptChunkContent>,
        emit_options: Option<ResolvedVc<EcmascriptEmitOptions>>,
    ) -> Result<Vc<Self>> {
        let Some(chunk_path) = output_root.get_path_to(&chunk_path) else {
            turbobail!("chunk path {chunk_path} is not in output root {output_root}");
        };
        let entries_hashes = EcmascriptChunkContentEntries::new(content)
            .await?
            .iter()
            .map(async |(id, entry)| Ok((id.clone(), *entry.hash.await?)))
            .try_join()
            .await?
            .into_iter()
            .collect();

        Ok(EcmascriptChunkVersion {
            chunk_path: chunk_path.into(),
            emit_options: match emit_options {
                Some(emit_options) => Some(emit_options.await?),
                None => None,
            },
            entries_hashes,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl Version for EcmascriptChunkVersion {
    #[turbo_tasks::function]
    fn id(&self) -> Vc<RcStr> {
        let mut hasher = Xxh3Hash64Hasher::new();
        hasher.write_ref(&self.chunk_path);
        let mut emit_options_hasher = Xxh3StdHasher(Xxh3Hash64Hasher::new());
        self.emit_options.as_deref().hash(&mut emit_options_hasher);
        hasher.write_value(emit_options_hasher.finish());
        let sorted_hashes = {
            let mut hashes: Vec<_> = self.entries_hashes.values().copied().collect();
            hashes.sort();
            hashes
        };
        for hash in sorted_hashes {
            hasher.write_value(hash);
        }
        let hash = hasher.finish();
        let hash = encode_base64(hash);
        Vc::cell(hash.into())
    }
}

/// The version of a [`super::content::EcmascriptMergedChunkContent`]. This is
/// essentially a composite [`EcmascriptChunkVersion`].
#[turbo_tasks::value(serialization = "skip", shared)]
pub struct EcmascriptMergedChunkVersion {
    pub versions: Vec<ReadRef<EcmascriptChunkVersion>>,
}

#[turbo_tasks::value_impl]
impl Version for EcmascriptMergedChunkVersion {
    #[turbo_tasks::function]
    async fn id(&self) -> Result<Vc<RcStr>> {
        let mut hasher = Xxh3Hash64Hasher::new();
        hasher.write_value(self.versions.len());
        let sorted_ids = {
            let mut sorted_ids = self
                .versions
                .iter()
                // This `ReadRef::cell` call is important: it ensures the id is
                // computed from a cell, so it is cached.
                .map(|version| ReadRef::cell(version.clone()).id())
                .try_join()
                .await?;
            sorted_ids.sort();
            sorted_ids
        };
        for id in sorted_ids {
            hasher.write_value(id);
        }
        let hash = hasher.finish();
        let hash = encode_base64(hash);
        Ok(Vc::cell(hash.into()))
    }
}
