use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
use turbo_esregex::EsRegex;
use turbo_rcstr::RcStr;
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
    ResourcePathEndsWith(RcStr),
    ResourcePathInDirectory(RcStr),
    ResourcePathInExactDirectory(ReadRef<FileSystemPath>),
    ContentTypeStartsWith(RcStr),
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
        enum Op<'a> {
            All(&'a [RuleCondition]), // Remaining conditions in an All
            Any(&'a [RuleCondition]), // Remaining conditions in an Any
            Not,                      // Inverts the previous condition
        }

        // Evaluates the condition returning the result and possibly pushing additional operations
        // onto the stack as a kind of continuation.
        async fn process_condition<'a, const SZ: usize>(
            source: ResolvedVc<Box<dyn Source + 'static>>,
            path: &FileSystemPath,
            reference_type: &ReferenceType,
            stack: &mut SmallVec<[Op<'a>; SZ]>,
            mut cond: &'a RuleCondition,
        ) -> Result<bool, anyhow::Error> {
            // Use a loop to avoid recursion and unnecessary stack operations.
            loop {
                match cond {
                    RuleCondition::All(conditions) => {
                        if conditions.is_empty() {
                            return Ok(true);
                        } else {
                            if conditions.len() > 1 {
                                stack.push(Op::All(&conditions[1..]));
                            }
                            cond = &conditions[0];
                            // jump directly to the next condition, no need to deal with
                            // the stack.
                            continue;
                        }
                    }
                    RuleCondition::Any(conditions) => {
                        if conditions.is_empty() {
                            return Ok(false);
                        } else {
                            if conditions.len() > 1 {
                                stack.push(Op::Any(&conditions[1..]));
                            }
                            cond = &conditions[0];
                            continue;
                        }
                    }
                    RuleCondition::Not(inner) => {
                        stack.push(Op::Not);
                        cond = inner.as_ref();
                        continue;
                    }
                    RuleCondition::ReferenceType(condition_ty) => {
                        return Ok(condition_ty.includes(reference_type));
                    }
                    RuleCondition::ResourceIsVirtualSource => {
                        return Ok(ResolvedVc::try_downcast_type::<VirtualSource>(source).is_some());
                    }
                    RuleCondition::ResourcePathEquals(other) => {
                        return Ok(path == &**other);
                    }
                    RuleCondition::ResourcePathEndsWith(end) => {
                        return Ok(path.path.ends_with(end.as_str()));
                    }
                    RuleCondition::ResourcePathHasNoExtension => {
                        return Ok(if let Some(i) = path.path.rfind('.') {
                            if let Some(j) = path.path.rfind('/') {
                                j > i
                            } else {
                                false
                            }
                        } else {
                            true
                        });
                    }
                    RuleCondition::ResourcePathInDirectory(dir) => {
                        return Ok(path.path.starts_with(&format!("{dir}/"))
                            || path.path.contains(&format!("/{dir}/")));
                    }
                    RuleCondition::ResourcePathInExactDirectory(parent_path) => {
                        return Ok(path.is_inside_ref(parent_path));
                    }
                    RuleCondition::ContentTypeStartsWith(start) => {
                        let content_type = &source.ident().await?.content_type;
                        return Ok(content_type
                            .as_ref()
                            .is_some_and(|ct| ct.starts_with(start.as_str())));
                    }
                    RuleCondition::ContentTypeEmpty => {
                        return Ok(source.ident().await?.content_type.is_none());
                    }
                    RuleCondition::ResourcePathGlob { glob, base } => {
                        return Ok(if let Some(rel_path) = base.get_relative_path_to(path) {
                            glob.matches(&rel_path)
                        } else {
                            glob.matches(&path.path)
                        });
                    }
                    RuleCondition::ResourceBasePathGlob(glob) => {
                        let basename = path
                            .path
                            .rsplit_once('/')
                            .map_or(path.path.as_str(), |(_, b)| b);
                        return Ok(glob.matches(basename));
                    }
                    RuleCondition::ResourcePathRegex(_) => {
                        bail!("ResourcePathRegex not implemented yet");
                    }
                    RuleCondition::ResourcePathEsRegex(regex) => {
                        return Ok(regex.is_match(&path.path));
                    }
                }
            }
        }
        // Allocate a small inline stack to avoid heap allocations in the common case where
        // conditions are not deeply stacked.  Additionally we take care to avoid stack
        // operations unless strictly necessary.
        const EXPECTED_SIZE: usize = 8;
        let mut stack = SmallVec::<[Op; EXPECTED_SIZE]>::with_capacity(EXPECTED_SIZE);
        let mut result = process_condition(source, path, reference_type, &mut stack, self).await?;
        while let Some(op) = stack.pop() {
            match op {
                Op::All(remaining) => {
                    // Previous was true, keep going
                    if result {
                        if remaining.len() > 1 {
                            stack.push(Op::All(&remaining[1..]));
                        }
                        result = process_condition(
                            source,
                            path,
                            reference_type,
                            &mut stack,
                            &remaining[0],
                        )
                        .await?;
                    }
                }
                Op::Any(remaining) => {
                    // Previous was false, keep going
                    if !result {
                        if remaining.len() > 1 {
                            stack.push(Op::Any(&remaining[1..]));
                        }
                        // If the stack didn't change, we can loop inline, but we would still need
                        // to pop the item.  This might be faster since we would avoid the `match`
                        // but overall, that is quite minor for an enum with 3 cases.
                        result = process_condition(
                            source,
                            path,
                            reference_type,
                            &mut stack,
                            &remaining[0],
                        )
                        .await?;
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
pub mod tests {
    use turbo_rcstr::rcstr;
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
        tt.run_once(async { run_leaves_test().await })
            .await
            .unwrap();
    }

    #[turbo_tasks::function]
    pub async fn run_leaves_test() -> Result<()> {
        let fs = VirtualFileSystem::new();
        let virtual_path = fs.root().join(rcstr!("foo.js"));
        let virtual_source = Vc::upcast::<Box<dyn Source>>(VirtualSource::new(
            virtual_path,
            AssetContent::File(FileContent::NotFound.cell().to_resolved().await?).cell(),
        ))
        .to_resolved()
        .await?;

        let non_virtual_path = fs.root().join(rcstr!("bar.js"));
        let non_virtual_source = Vc::upcast::<Box<dyn Source>>(FileSource::new(non_virtual_path))
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
                        &*fs.root().join(rcstr!("foo")).await?,
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
            let condition = RuleCondition::ResourcePathEndsWith(rcstr!("foo.js"));
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
    }

    #[tokio::test]
    async fn test_rule_condition_tree() {
        crate::register();
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async { run_rule_condition_tree_test().await })
            .await
            .unwrap();
    }

    #[turbo_tasks::function]
    pub async fn run_rule_condition_tree_test() -> Result<()> {
        let fs = VirtualFileSystem::new();
        let virtual_path = fs.root().join(rcstr!("foo.js"));
        let virtual_source = Vc::upcast::<Box<dyn Source>>(VirtualSource::new(
            virtual_path,
            AssetContent::File(FileContent::NotFound.cell().to_resolved().await?).cell(),
        ))
        .to_resolved()
        .await?;

        let non_virtual_path = fs.root().join(rcstr!("bar.js"));
        let non_virtual_source = Vc::upcast::<Box<dyn Source>>(FileSource::new(non_virtual_path))
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
                RuleCondition::ResourcePathInDirectory(rcstr!("doesnt/exist")),
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
                RuleCondition::ResourcePathEndsWith(rcstr!("foo.js")),
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
                    RuleCondition::ResourcePathEndsWith(rcstr!("foo.js")),
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
    }
}
