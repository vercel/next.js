use std::collections::VecDeque;

use anyhow::Result;
use bincode::{Decode, Encode};
use turbo_esregex::EsRegex;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ResolvedVc, TaskInput, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemPath, glob::Glob};

#[turbo_tasks::value]
#[derive(Debug)]
pub(crate) enum DirListEntry {
    File(FileSystemPath),
    Dir(ResolvedVc<DirList>),
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, TraceRawVcs, TaskInput, Encode, Decode)]
pub(crate) enum DirListFilter {
    Regex(Vc<EsRegex>),
    Glob(Vc<Glob>),
}

#[turbo_tasks::value(transparent)]
pub(crate) struct DirList(
    #[bincode(with = "turbo_bincode::indexmap")] FxIndexMap<RcStr, DirListEntry>,
);

#[turbo_tasks::value_impl]
impl DirList {
    #[turbo_tasks::function]
    pub(crate) fn read(dir: FileSystemPath, recursive: bool, filter: DirListFilter) -> Vc<Self> {
        Self::read_internal(dir.clone(), dir, recursive, filter)
    }

    #[turbo_tasks::function]
    pub(crate) async fn read_internal(
        root: FileSystemPath,
        dir: FileSystemPath,
        recursive: bool,
        filter: DirListFilter,
    ) -> Result<Vc<Self>> {
        let root_val = root.clone();
        let dir_val = dir.clone();

        let mut list = FxIndexMap::default();

        match filter {
            DirListFilter::Regex(es_regex) => {
                let regex = &es_regex.await?;

                let dir_content = dir.read_dir().await?;
                let entries = match &*dir_content {
                    DirectoryContent::Entries(entries) => Some(entries),
                    DirectoryContent::NotFound => None,
                };

                for (_, entry) in entries.iter().flat_map(|m| m.iter()) {
                    match entry {
                        DirectoryEntry::File(path) => {
                            if let Some(relative_path) = root_val.get_relative_path_to(path)
                                && regex.is_match(&relative_path)
                            {
                                list.insert(relative_path, DirListEntry::File(path.clone()));
                            }
                        }
                        DirectoryEntry::Directory(path) if recursive => {
                            if let Some(relative_path) = dir_val.get_relative_path_to(path) {
                                list.insert(
                                    relative_path,
                                    DirListEntry::Dir(
                                        DirList::read_internal(
                                            root.clone(),
                                            path.clone(),
                                            recursive,
                                            DirListFilter::Regex(es_regex),
                                        )
                                        .to_resolved()
                                        .await?,
                                    ),
                                );
                            }
                        }
                        // ignore everything else
                        _ => {}
                    }
                }
            }
            DirListFilter::Glob(glob) => {
                // a double-ended queue of ReadGlobResults
                let mut glob_results = VecDeque::with_capacity(1);
                glob_results.push_back(dir_val.read_glob(glob).await?);

                while let Some(result) = glob_results.pop_front() {
                    let results = &result.results;
                    let inner = &result.inner;
                    for (_, entry) in results.iter() {
                        let DirectoryEntry::File(path) = entry else {
                            continue;
                        };
                        if let Some(relative_path) = root_val.get_relative_path_to(path) {
                            list.insert(relative_path, DirListEntry::File(path.clone()));
                        }
                    }

                    if recursive {
                        for (_, inner_results) in inner.iter() {
                            glob_results.push_back(inner_results.await?);
                        }
                    }
                }
            }
        }

        list.sort_keys();

        Ok(Vc::cell(list))
    }

    #[turbo_tasks::function]
    async fn flatten(self: Vc<Self>) -> Result<Vc<FlatDirList>> {
        let this = self.await?;

        let mut queue = VecDeque::from([this]);

        let mut list = FxIndexMap::default();

        while let Some(dir) = queue.pop_front() {
            for (k, entry) in &*dir {
                match entry {
                    DirListEntry::File(path) => {
                        list.insert(k.clone(), path.clone());
                    }
                    DirListEntry::Dir(d) => {
                        queue.push_back(d.await?);
                    }
                }
            }
        }

        Ok(Vc::cell(list))
    }
}

#[turbo_tasks::value(transparent)]
pub(crate) struct FlatDirList(
    #[bincode(with = "turbo_bincode::indexmap")] FxIndexMap<RcStr, FileSystemPath>,
);

#[turbo_tasks::value_impl]
impl FlatDirList {
    #[turbo_tasks::function]
    pub(crate) fn read(dir: FileSystemPath, recursive: bool, filter: DirListFilter) -> Vc<Self> {
        DirList::read(dir, recursive, filter).flatten()
    }
}

#[cfg(test)]
mod tests {

    use std::{
        fs::{File, create_dir},
        io::prelude::*,
    };

    use turbo_esregex::EsRegex;
    use turbo_rcstr::{RcStr, rcstr};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{
        DiskFileSystem, FileSystem,
        glob::{Glob, GlobOptions},
    };

    use crate::references::dir_list::{DirListFilter, FlatDirList};

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn regex_filter_basic() {
        let scratch = tempfile::tempdir().unwrap();
        {
            // Create a directory for 3 files
            let path = scratch.path();
            File::create_new(path.join("a.js"))
                .unwrap()
                .write_all(b"AAA")
                .unwrap();
            File::create_new(path.join("b.js"))
                .unwrap()
                .write_all(b"BBB")
                .unwrap();
            File::create_new(path.join("c.ts"))
                .unwrap()
                .write_all(b"CCC")
                .unwrap();
        }
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));

        let path: RcStr = scratch.path().to_str().unwrap().into();
        tt.run_once(async {
            let fs = DiskFileSystem::new(rcstr!("temp"), path);
            let root = fs.root().await?;
            let dir_list = FlatDirList::read(
                (*root).clone(),
                true,
                DirListFilter::Regex(EsRegex::new(".*js$", "").unwrap().cell()),
            )
            .await?;

            let mut list_iter = dir_list.iter().map(|(rel, _)| rel.to_string());
            assert_eq!(list_iter.next(), Some(String::from("./a.js")));
            assert_eq!(list_iter.next(), Some(String::from("./b.js")));
            // c.ts extension doesn't match
            assert_eq!(list_iter.next(), None);

            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn glob_filter_basic() {
        let scratch = tempfile::tempdir().unwrap();
        {
            // Create a tree of directories
            //
            // new_button.tsx
            // old_button.tsx
            // components/
            //     header.tsx
            //     updated/
            //         header_new.tsx
            //         footer.tsx
            //         i_knew_it.tsx
            let path = scratch.path();
            File::create_new(path.join("new_button.tsx"))
                .unwrap()
                .write_all(b"new button")
                .unwrap();
            File::create_new(path.join("old_button.tsx"))
                .unwrap()
                .write_all(b"old button")
                .unwrap();

            create_dir(path.join("components")).unwrap();
            File::create_new(path.join("components").join("header.tsx"))
                .unwrap()
                .write_all(b"old header")
                .unwrap();

            create_dir(path.join("components/updated")).unwrap();
            File::create_new(
                path.join("components")
                    .join("updated")
                    .join("header_new.tsx"),
            )
            .unwrap()
            .write_all(b"new header")
            .unwrap();
            File::create_new(path.join("components").join("updated").join("footer.tsx"))
                .unwrap()
                .write_all(b"footer")
                .unwrap();
            File::create_new(
                path.join("components")
                    .join("updated")
                    .join("i_knew_it.tsx"),
            )
            .unwrap()
            .write_all(b"feedback")
            .unwrap();
        }
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));

        let path: RcStr = scratch.path().to_str().unwrap().into();
        tt.run_once(async {
            let fs = DiskFileSystem::new(rcstr!("temp"), path);
            let root = fs.root().await?;
            let dir_list = FlatDirList::read(
                (*root).clone(),
                true,
                // match anything with "new" in the filename
                DirListFilter::Glob(Glob::new(rcstr!("**/*new*.tsx"), GlobOptions::default())),
            )
            .await?;

            let mut list_iter = dir_list.iter().map(|(rel, _)| rel.to_string());
            // list should be sorted in lexical order
            assert_eq!(
                list_iter.next(),
                Some(String::from("./components/updated/header_new.tsx"))
            );
            assert_eq!(
                list_iter.next(),
                Some(String::from("./components/updated/i_knew_it.tsx"))
            );
            assert_eq!(list_iter.next(), Some(String::from("./new_button.tsx")));
            assert_eq!(list_iter.next(), None);

            anyhow::Ok(())
        })
        .await
        .unwrap();
    }
}
