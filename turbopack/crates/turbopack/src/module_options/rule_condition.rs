use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
use turbo_esregex::EsRegex;
use turbo_tasks::{NonLocalValue, ReadRef, ResolvedVc, primitives::Regex, trace::TraceRawVcs};
use turbo_tasks_fs::{FileSystemPath, glob::Glob};
use turbopack_core::{
    reference_type::ReferenceType, source::Source, virtual_source::VirtualSource,
};

#[derive(Debug, Clone, Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, NonLocalValue)]
pub enum RuleCondition {
    All(Vec<RuleCondition>),
    Any(Vec<RuleCondition>),
    Not(Box<RuleCondition>),
    ReferenceType(ReferenceType),
    ResourceIsVirtualSource,
    ResourcePathEquals(ReadRef<FileSystemPath>),
    ResourcePathHasNoExtension,
    ResourcePathEndsWith(String),
    ResourcePathInDirectory(String),
    ResourcePathInExactDirectory(ReadRef<FileSystemPath>),
    ContentTypeStartsWith(String),
    ContentTypeEmpty,
    ResourcePathRegex(#[turbo_tasks(trace_ignore)] Regex),
    ResourcePathEsRegex(#[turbo_tasks(trace_ignore)] ReadRef<EsRegex>),
    /// For paths that are within the same filesystem as the `base`, it need to
    /// match the relative path from base to resource. This includes `./` or
    /// `../` prefix. For paths in a different filesystem, it need to match
    /// the resource path in that filesystem without any prefix. This means
    /// any glob starting with `./` or `../` will only match paths in the
    /// project. Globs starting with `**` can match any path.
    ResourcePathGlob {
        base: ReadRef<FileSystemPath>,
        #[turbo_tasks(trace_ignore)]
        glob: ReadRef<Glob>,
    },
    ResourceBasePathGlob(#[turbo_tasks(trace_ignore)] ReadRef<Glob>),
}

impl RuleCondition {
    pub fn all(conditions: Vec<RuleCondition>) -> RuleCondition {
        RuleCondition::All(conditions)
    }

    pub fn any(conditions: Vec<RuleCondition>) -> RuleCondition {
        RuleCondition::Any(conditions)
    }

    #[allow(clippy::should_implement_trait)]
    pub fn not(condition: RuleCondition) -> RuleCondition {
        RuleCondition::Not(Box::new(condition))
    }
}

impl RuleCondition {
    pub async fn matches(
        &self,
        source: ResolvedVc<Box<dyn Source>>,
        path: &FileSystemPath,
        reference_type: &ReferenceType,
    ) -> Result<bool> {
        // Use an explicit stack to avoid recursion.
        enum Op<'a> {
            Condition(&'a RuleCondition),
            All(&'a [RuleCondition]), // Remaining conditions in an All
            Any(&'a [RuleCondition]), // Remaining conditions in an Any
            Not,                      // Inverts the previous condition
        }
        // The maximum stack height is 2 * the depth of the Any/All/Not rules
        // Allocate a small inline stack to avoid heap allocations in the common case where
        // conditions are not deeply stacked.
        // To do better we could:
        // introduce some local functions and loops so we can avoid allocating `Condition' ops
        // and lazily allocate the stack since it is only truly needed for nested any/all/not
        // conditions.  But a smallvec is probably good enough.
        const EXPECTED_SIZE: usize = 8;
        let mut stack = SmallVec::<[Op; EXPECTED_SIZE]>::with_capacity(EXPECTED_SIZE);
        let mut result = false;
        stack.push(Op::Condition(self));

        while let Some(frame) = stack.pop() {
            match frame {
                Op::Condition(cond) => match cond {
                    RuleCondition::All(conditions) => {
                        if conditions.is_empty() {
                            result = true;
                        } else {
                            if conditions.len() > 1 {
                                stack.push(Op::All(&conditions.as_slice()));
                            }
                            // We could save some stack operation and destructing logic by looping
                            // here.
                            stack.push(Op::Condition(&conditions[0]));
                        }
                    }
                    RuleCondition::Any(conditions) => {
                        if conditions.is_empty() {
                            result = false;
                        } else {
                            if conditions.len() > 1 {
                                stack.push(Op::Any(&conditions.as_slice()[1..]));
                            }
                            stack.push(Op::Condition(&conditions[0]));
                        }
                    }
                    RuleCondition::Not(inner) => {
                        stack.push(Op::Not);
                        stack.push(Op::Condition(inner));
                    }
                    RuleCondition::ReferenceType(condition_ty) => {
                        result = condition_ty.includes(reference_type);
                    }
                    RuleCondition::ResourceIsVirtualSource => {
                        result = ResolvedVc::try_downcast_type::<VirtualSource>(source).is_some();
                    }
                    RuleCondition::ResourcePathEquals(other) => {
                        result = path == &**other;
                    }
                    RuleCondition::ResourcePathEndsWith(end) => {
                        result = path.path.ends_with(end);
                    }
                    RuleCondition::ResourcePathHasNoExtension => {
                        let res = if let Some(i) = path.path.rfind('.') {
                            if let Some(j) = path.path.rfind('/') {
                                j > i
                            } else {
                                false
                            }
                        } else {
                            true
                        };
                        result = res;
                    }
                    RuleCondition::ResourcePathInDirectory(dir) => {
                        result = path.path.starts_with(&format!("{dir}/"))
                            || path.path.contains(&format!("/{dir}/"));
                    }
                    RuleCondition::ResourcePathInExactDirectory(parent_path) => {
                        result = path.is_inside_ref(parent_path);
                    }
                    RuleCondition::ContentTypeStartsWith(start) => {
                        let content_type = &source.ident().await?.content_type;
                        result = content_type
                            .as_ref()
                            .is_some_and(|ct| ct.starts_with(start));
                    }
                    RuleCondition::ContentTypeEmpty => {
                        result = source.ident().await?.content_type.is_none();
                    }
                    RuleCondition::ResourcePathGlob { glob, base } => {
                        let res = if let Some(rel_path) = base.get_relative_path_to(path) {
                            glob.execute(&rel_path)
                        } else {
                            glob.execute(&path.path)
                        };
                        result = res;
                    }
                    RuleCondition::ResourceBasePathGlob(glob) => {
                        let basename = path
                            .path
                            .rsplit_once('/')
                            .map_or(path.path.as_str(), |(_, b)| b);
                        result = glob.execute(basename);
                    }
                    RuleCondition::ResourcePathRegex(_) => {
                        bail!("ResourcePathRegex not implemented yet");
                    }
                    RuleCondition::ResourcePathEsRegex(regex) => {
                        result = regex.is_match(&path.path);
                    }
                },
                Op::All(remaining) => {
                    // Previous was true, keep going
                    if result {
                        if remaining.len() > 1 {
                            stack.push(Op::All(&remaining[1..]));
                        }
                        stack.push(Op::Condition(&remaining[0]));
                    }
                }
                Op::Any(remaining) => {
                    // Previous was false, keep going if we have more
                    if !result {
                        if remaining.len() > 1 {
                            stack.push(Op::Any(&remaining[1..]));
                        }
                        stack.push(Op::Condition(&remaining[0]));
                    }
                }
                Op::Not => {
                    result = !result;
                }
            }
        }
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use turbo_tasks::Vc;
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{FileContent, FileSystem, VirtualFileSystem};
    use turbopack_core::{asset::AssetContent, file_source::FileSource};

    use super::*;

    #[tokio::test]
    async fn test_rule_condition_leaves() {
        crate::register();
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async {
            let fs = VirtualFileSystem::new();
            let virtual_path = fs.root().join("foo.js".into());
            let virtual_source = Vc::upcast::<Box<dyn Source>>(VirtualSource::new(
                virtual_path,
                AssetContent::File(FileContent::NotFound.cell().to_resolved().await?).cell(),
            ))
            .to_resolved()
            .await?;

            let non_virtual_path = fs.root().join("bar.js".into());
            let non_virtual_source =
                Vc::upcast::<Box<dyn Source>>(FileSource::new(non_virtual_path))
                    .to_resolved()
                    .await?;

            {
                let condition = RuleCondition::ReferenceType(ReferenceType::Runtime);
                assert!(
                    condition
                        .matches(
                            virtual_source,
                            &*virtual_path.await?,
                            &ReferenceType::Runtime
                        )
                        .await
                        .unwrap()
                );
                assert!(
                    !condition
                        .matches(
                            non_virtual_source,
                            &*non_virtual_path.await?,
                            &ReferenceType::Css(
                                turbopack_core::reference_type::CssReferenceSubType::Compose
                            )
                        )
                        .await
                        .unwrap()
                );
            }

            {
                let condition = RuleCondition::ResourceIsVirtualSource;
                assert!(
                    condition
                        .matches(
                            virtual_source,
                            &*virtual_path.await?,
                            &ReferenceType::Undefined
                        )
                        .await
                        .unwrap()
                );
                assert!(
                    !condition
                        .matches(
                            non_virtual_source,
                            &*non_virtual_path.await?,
                            &ReferenceType::Undefined
                        )
                        .await
                        .unwrap()
                );
            }
            {
                let condition = RuleCondition::ResourcePathEquals(virtual_path.await?);
                assert!(
                    condition
                        .matches(
                            virtual_source,
                            &*virtual_path.await?,
                            &ReferenceType::Undefined
                        )
                        .await
                        .unwrap()
                );
                assert!(
                    !condition
                        .matches(
                            non_virtual_source,
                            &*non_virtual_path.await?,
                            &ReferenceType::Undefined
                        )
                        .await
                        .unwrap()
                );
            }
            {
                let condition = RuleCondition::ResourcePathHasNoExtension;
                assert!(
                    condition
                        .matches(
                            virtual_source,
                            &*fs.root().join("foo".into()).await?,
                            &ReferenceType::Undefined
                        )
                        .await
                        .unwrap()
                );
                assert!(
                    !condition
                        .matches(
                            non_virtual_source,
                            &*non_virtual_path.await?,
                            &ReferenceType::Undefined
                        )
                        .await
                        .unwrap()
                );
            }
            {
                let condition = RuleCondition::ResourcePathEndsWith("foo.js".to_string());
                assert!(
                    condition
                        .matches(
                            virtual_source,
                            &*virtual_path.await?,
                            &ReferenceType::Undefined
                        )
                        .await
                        .unwrap()
                );
                assert!(
                    !condition
                        .matches(
                            non_virtual_source,
                            &*non_virtual_path.await?,
                            &ReferenceType::Undefined
                        )
                        .await
                        .unwrap()
                );
            }
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn test_rule_condition_tree() {
        crate::register();
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async {
            let fs = VirtualFileSystem::new();
            let virtual_path = fs.root().join("foo.js".into());
            let virtual_source = Vc::upcast::<Box<dyn Source>>(VirtualSource::new(
                virtual_path,
                AssetContent::File(FileContent::NotFound.cell().to_resolved().await?).cell(),
            ))
            .to_resolved()
            .await?;

            let non_virtual_path = fs.root().join("bar.js".into());
            let non_virtual_source =
                Vc::upcast::<Box<dyn Source>>(FileSource::new(non_virtual_path))
                    .to_resolved()
                    .await?;

            {
                // not
                let condition = RuleCondition::not(RuleCondition::ResourceIsVirtualSource);
                assert!(
                    !condition
                        .matches(
                            virtual_source,
                            &*virtual_path.await?,
                            &ReferenceType::Undefined
                        )
                        .await
                        .unwrap()
                );
                assert!(
                    condition
                        .matches(
                            non_virtual_source,
                            &*non_virtual_path.await?,
                            &ReferenceType::Undefined
                        )
                        .await
                        .unwrap()
                );
            }
            {
                // any
                // Only one of the conditions matches our virtual source
                let condition = RuleCondition::any(vec![
                    RuleCondition::ResourcePathInDirectory("doesnt/exist".to_string()),
                    RuleCondition::ResourceIsVirtualSource,
                    RuleCondition::ResourcePathHasNoExtension,
                ]);
                assert!(
                    condition
                        .matches(
                            virtual_source,
                            &*virtual_path.await?,
                            &ReferenceType::Undefined
                        )
                        .await
                        .unwrap()
                );
                assert!(
                    !condition
                        .matches(
                            non_virtual_source,
                            &*non_virtual_path.await?,
                            &ReferenceType::Undefined
                        )
                        .await
                        .unwrap()
                );
            }
            {
                // all
                // Only one of the conditions matches our virtual source
                let condition = RuleCondition::all(vec![
                    RuleCondition::ResourcePathEndsWith("foo.js".to_string()),
                    RuleCondition::ResourceIsVirtualSource,
                    RuleCondition::ResourcePathEquals(virtual_path.await?),
                ]);
                assert!(
                    condition
                        .matches(
                            virtual_source,
                            &*virtual_path.await?,
                            &ReferenceType::Undefined
                        )
                        .await
                        .unwrap()
                );
                assert!(
                    !condition
                        .matches(
                            non_virtual_source,
                            &*non_virtual_path.await?,
                            &ReferenceType::Undefined
                        )
                        .await
                        .unwrap()
                );
            }
            {
                // bigger tree

                // Build a simple tree to cover our various composite conditions
                let condition = RuleCondition::all(vec![
                    RuleCondition::ResourceIsVirtualSource,
                    RuleCondition::ResourcePathEquals(virtual_path.await?),
                    RuleCondition::Not(Box::new(RuleCondition::ResourcePathHasNoExtension)),
                    RuleCondition::Any(vec![
                        RuleCondition::ResourcePathEndsWith("foo.js".to_string()),
                        RuleCondition::ContentTypeEmpty,
                    ]),
                ]);
                assert!(
                    condition
                        .matches(
                            virtual_source,
                            &*virtual_path.await?,
                            &ReferenceType::Undefined
                        )
                        .await
                        .unwrap()
                );
                assert!(
                    !condition
                        .matches(
                            non_virtual_source,
                            &*non_virtual_path.await?,
                            &ReferenceType::Undefined
                        )
                        .await
                        .unwrap()
                );
            }
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }
}
