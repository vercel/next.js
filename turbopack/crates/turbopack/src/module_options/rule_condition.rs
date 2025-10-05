use std::{
    iter,
    mem::{replace, take},
};

use anyhow::{Result, bail};
use either::Either;
use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
use turbo_esregex::EsRegex;
use turbo_tasks::{NonLocalValue, ReadRef, ResolvedVc, primitives::Regex, trace::TraceRawVcs};
use turbo_tasks_fs::{FileContent, FileSystemPath, glob::Glob};
use turbopack_core::{
    asset::Asset, reference_type::ReferenceType, source::Source, virtual_source::VirtualSource,
};

#[derive(Debug, Clone, Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, NonLocalValue)]
pub enum RuleCondition {
    All(Vec<RuleCondition>),
    Any(Vec<RuleCondition>),
    Not(Box<RuleCondition>),
    True,
    False,
    ReferenceType(ReferenceType),
    ResourceIsVirtualSource,
    ResourcePathEquals(FileSystemPath),
    ResourcePathHasNoExtension,
    ResourcePathEndsWith(String),
    ResourcePathInDirectory(String),
    ResourcePathInExactDirectory(FileSystemPath),
    ContentTypeStartsWith(String),
    ContentTypeEmpty,
    ResourcePathRegex(#[turbo_tasks(trace_ignore)] Regex),
    ResourcePathEsRegex(#[turbo_tasks(trace_ignore)] ReadRef<EsRegex>),
    ResourceContentEsRegex(#[turbo_tasks(trace_ignore)] ReadRef<EsRegex>),
    /// For paths that are within the same filesystem as the `base`, it need to
    /// match the relative path from base to resource. This includes `./` or
    /// `../` prefix. For paths in a different filesystem, it need to match
    /// the resource path in that filesystem without any prefix. This means
    /// any glob starting with `./` or `../` will only match paths in the
    /// project. Globs starting with `**` can match any path.
    ResourcePathGlob {
        base: FileSystemPath,
        #[turbo_tasks(trace_ignore)]
        glob: ReadRef<Glob>,
    },
    ResourceBasePathGlob(#[turbo_tasks(trace_ignore)] ReadRef<Glob>),
    ResourceQueryContains(String),
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

    /// Slightly optimize a `RuleCondition` by flattening nested `Any`, `All`, or `Not` variants.
    ///
    /// Does not apply general re-ordering of rules (which may also be a valid optimization using a
    /// cost heuristic), but does flatten constant `True` and `False` conditions, potentially
    /// skipping other rules.
    pub fn flatten(&mut self) {
        match self {
            RuleCondition::Any(conds) => {
                // fast path: flatten children in-place and avoid constructing an additional vec
                let mut needs_flattening = false;
                for c in conds.iter_mut() {
                    c.flatten();
                    if *c == RuleCondition::True {
                        // short-circuit: all conditions are side-effect free
                        *self = RuleCondition::True;
                        return;
                    }
                    needs_flattening = needs_flattening
                        || matches!(c, RuleCondition::Any(_) | RuleCondition::False);
                }

                if needs_flattening {
                    *conds = take(conds)
                        .into_iter()
                        .flat_map(|c| match c {
                            RuleCondition::Any(nested) => {
                                debug_assert!(!nested.is_empty(), "empty Any should be False");
                                Either::Left(nested.into_iter())
                            }
                            RuleCondition::False => Either::Right(Either::Left(iter::empty())),
                            c => Either::Right(Either::Right(iter::once(c))),
                        })
                        .collect();
                }

                match conds.len() {
                    0 => *self = RuleCondition::False,
                    1 => *self = take(conds).into_iter().next().unwrap(),
                    _ => {}
                }
            }
            RuleCondition::All(conds) => {
                // fast path: flatten children in-place and avoid constructing an additional vec
                let mut needs_flattening = false;
                for c in conds.iter_mut() {
                    c.flatten();
                    if *c == RuleCondition::False {
                        // short-circuit: all conditions are side-effect free
                        *self = RuleCondition::False;
                        return;
                    }
                    needs_flattening = needs_flattening
                        || matches!(c, RuleCondition::All(_) | RuleCondition::True);
                }

                if needs_flattening {
                    *conds = take(conds)
                        .into_iter()
                        .flat_map(|c| match c {
                            RuleCondition::All(nested) => {
                                debug_assert!(!nested.is_empty(), "empty All should be True");
                                Either::Left(nested.into_iter())
                            }
                            RuleCondition::True => Either::Right(Either::Left(iter::empty())),
                            c => Either::Right(Either::Right(iter::once(c))),
                        })
                        .collect();
                }

                match conds.len() {
                    0 => *self = RuleCondition::True,
                    1 => *self = take(conds).into_iter().next().unwrap(),
                    _ => {}
                }
            }
            RuleCondition::Not(cond) => {
                match &mut **cond {
                    // nested `Not`s negate each other
                    RuleCondition::Not(inner) => {
                        let inner = &mut **inner;
                        inner.flatten();
                        // Use `replace` with a dummy condition instead of `take` since
                        // `RuleCondition` doesn't implement `Default`.
                        *self = replace(inner, RuleCondition::False)
                    }
                    RuleCondition::True => *self = RuleCondition::False,
                    RuleCondition::False => *self = RuleCondition::True,
                    other => other.flatten(),
                }
            }
            _ => {}
        }
    }

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
                    RuleCondition::True => {
                        return Ok(true);
                    }
                    RuleCondition::False => {
                        return Ok(false);
                    }
                    RuleCondition::ReferenceType(condition_ty) => {
                        return Ok(condition_ty.includes(reference_type));
                    }
                    RuleCondition::ResourceIsVirtualSource => {
                        return Ok(ResolvedVc::try_downcast_type::<VirtualSource>(source).is_some());
                    }
                    RuleCondition::ResourcePathEquals(other) => {
                        return Ok(path == other);
                    }
                    RuleCondition::ResourcePathEndsWith(end) => {
                        return Ok(path.path.ends_with(end));
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
                    RuleCondition::ResourceContentEsRegex(regex) => {
                        let content = source.content().file_content().await?;
                        match &*content {
                            FileContent::Content(file_content) => {
                                return Ok(regex.is_match(&file_content.content().to_str()?));
                            }
                            FileContent::NotFound => return Ok(false),
                        }
                    }
                    RuleCondition::ResourceQueryContains(query) => {
                        let ident = source.ident().await?;
                        return Ok(ident.query.contains(query));
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
    use turbo_tasks::Vc;
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{FileContent, FileSystem, VirtualFileSystem};
    use turbopack_core::{asset::AssetContent, file_source::FileSource};

    use super::*;

    #[test]
    fn flatten_any_with_single_child_collapses() {
        let mut rc = RuleCondition::Any(vec![RuleCondition::True]);
        rc.flatten();
        assert_eq!(rc, RuleCondition::True);

        let mut rc = RuleCondition::Any(vec![RuleCondition::ContentTypeEmpty]);
        rc.flatten();
        assert_eq!(rc, RuleCondition::ContentTypeEmpty);
    }

    #[test]
    fn flatten_any_nested_and_false() {
        let mut rc = RuleCondition::Any(vec![
            RuleCondition::False,
            RuleCondition::Any(vec![RuleCondition::ContentTypeEmpty, RuleCondition::False]),
        ]);
        rc.flatten();
        assert_eq!(rc, RuleCondition::ContentTypeEmpty);
    }

    #[test]
    fn flatten_any_short_circuits_on_true() {
        let mut rc = RuleCondition::Any(vec![
            RuleCondition::False,
            RuleCondition::True,
            RuleCondition::ContentTypeEmpty,
        ]);
        rc.flatten();
        assert_eq!(rc, RuleCondition::True);
    }

    #[test]
    fn flatten_any_empty_becomes_false() {
        let mut rc = RuleCondition::Any(vec![]);
        rc.flatten();
        assert_eq!(rc, RuleCondition::False);
    }

    #[test]
    fn flatten_all_with_single_child_collapses() {
        let mut rc = RuleCondition::All(vec![RuleCondition::ContentTypeEmpty]);
        rc.flatten();
        assert_eq!(rc, RuleCondition::ContentTypeEmpty);

        let mut rc = RuleCondition::All(vec![RuleCondition::True]);
        rc.flatten();
        assert_eq!(rc, RuleCondition::True);
    }

    #[test]
    fn flatten_all_nested_and_true() {
        let mut rc = RuleCondition::All(vec![
            RuleCondition::True,
            RuleCondition::All(vec![RuleCondition::ContentTypeEmpty, RuleCondition::True]),
        ]);
        rc.flatten();
        assert_eq!(rc, RuleCondition::ContentTypeEmpty);
    }

    #[test]
    fn flatten_all_short_circuits_on_false() {
        let mut rc = RuleCondition::All(vec![
            RuleCondition::True,
            RuleCondition::False,
            RuleCondition::ContentTypeEmpty,
        ]);
        rc.flatten();
        assert_eq!(rc, RuleCondition::False);
    }

    #[test]
    fn flatten_all_empty_becomes_true() {
        let mut rc = RuleCondition::All(vec![]);
        rc.flatten();
        assert_eq!(rc, RuleCondition::True);
    }

    #[test]
    fn flatten_not_of_not() {
        let mut rc = RuleCondition::Not(Box::new(RuleCondition::Not(Box::new(
            RuleCondition::All(vec![RuleCondition::ContentTypeEmpty]),
        ))));
        rc.flatten();
        assert_eq!(rc, RuleCondition::ContentTypeEmpty);
    }

    #[test]
    fn flatten_not_constants() {
        let mut rc = RuleCondition::Not(Box::new(RuleCondition::True));
        rc.flatten();
        assert_eq!(rc, RuleCondition::False);

        let mut rc = RuleCondition::Not(Box::new(RuleCondition::False));
        rc.flatten();
        assert_eq!(rc, RuleCondition::True);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_rule_condition_leaves() {
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
        let virtual_path = fs.root().await?.join("foo.js")?;
        let virtual_source = Vc::upcast::<Box<dyn Source>>(VirtualSource::new(
            virtual_path.clone(),
            AssetContent::File(FileContent::NotFound.cell().to_resolved().await?).cell(),
        ))
        .to_resolved()
        .await?;

        let non_virtual_path = fs.root().await?.join("bar.js")?;
        let non_virtual_source =
            Vc::upcast::<Box<dyn Source>>(FileSource::new(non_virtual_path.clone()))
                .to_resolved()
                .await?;

        {
            let condition = RuleCondition::ReferenceType(ReferenceType::Runtime);
            assert!(
                condition
                    .matches(virtual_source, &virtual_path, &ReferenceType::Runtime)
                    .await
                    .unwrap()
            );
            assert!(
                !condition
                    .matches(
                        non_virtual_source,
                        &non_virtual_path,
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
                    .matches(virtual_source, &virtual_path, &ReferenceType::Undefined)
                    .await
                    .unwrap()
            );
            assert!(
                !condition
                    .matches(
                        non_virtual_source,
                        &non_virtual_path,
                        &ReferenceType::Undefined
                    )
                    .await
                    .unwrap()
            );
        }
        {
            let condition = RuleCondition::ResourcePathEquals(virtual_path.clone());
            assert!(
                condition
                    .matches(virtual_source, &virtual_path, &ReferenceType::Undefined)
                    .await
                    .unwrap()
            );
            assert!(
                !condition
                    .matches(
                        non_virtual_source,
                        &non_virtual_path,
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
                        &fs.root().await?.join("foo")?,
                        &ReferenceType::Undefined
                    )
                    .await
                    .unwrap()
            );
            assert!(
                !condition
                    .matches(
                        non_virtual_source,
                        &non_virtual_path,
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
                    .matches(virtual_source, &virtual_path, &ReferenceType::Undefined)
                    .await
                    .unwrap()
            );
            assert!(
                !condition
                    .matches(
                        non_virtual_source,
                        &non_virtual_path,
                        &ReferenceType::Undefined
                    )
                    .await
                    .unwrap()
            );
        }
        anyhow::Ok(())
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_rule_condition_tree() {
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
        let virtual_path = fs.root().await?.join("foo.js")?;
        let virtual_source = Vc::upcast::<Box<dyn Source>>(VirtualSource::new(
            virtual_path.clone(),
            AssetContent::File(FileContent::NotFound.cell().to_resolved().await?).cell(),
        ))
        .to_resolved()
        .await?;

        let non_virtual_path = fs.root().await?.join("bar.js")?;
        let non_virtual_source =
            Vc::upcast::<Box<dyn Source>>(FileSource::new(non_virtual_path.clone()))
                .to_resolved()
                .await?;

        {
            // not
            let condition = RuleCondition::not(RuleCondition::ResourceIsVirtualSource);
            assert!(
                !condition
                    .matches(virtual_source, &virtual_path, &ReferenceType::Undefined)
                    .await
                    .unwrap()
            );
            assert!(
                condition
                    .matches(
                        non_virtual_source,
                        &non_virtual_path,
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
                    .matches(virtual_source, &virtual_path, &ReferenceType::Undefined)
                    .await
                    .unwrap()
            );
            assert!(
                !condition
                    .matches(
                        non_virtual_source,
                        &non_virtual_path,
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
                RuleCondition::ResourcePathEquals(virtual_path.clone()),
            ]);
            assert!(
                condition
                    .matches(virtual_source, &virtual_path, &ReferenceType::Undefined)
                    .await
                    .unwrap()
            );
            assert!(
                !condition
                    .matches(
                        non_virtual_source,
                        &non_virtual_path,
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
                RuleCondition::ResourcePathEquals(virtual_path.clone()),
                RuleCondition::Not(Box::new(RuleCondition::ResourcePathHasNoExtension)),
                RuleCondition::Any(vec![
                    RuleCondition::ResourcePathEndsWith("foo.js".to_string()),
                    RuleCondition::ContentTypeEmpty,
                ]),
            ]);
            assert!(
                condition
                    .matches(virtual_source, &virtual_path, &ReferenceType::Undefined)
                    .await
                    .unwrap()
            );
            assert!(
                !condition
                    .matches(
                        non_virtual_source,
                        &non_virtual_path,
                        &ReferenceType::Undefined
                    )
                    .await
                    .unwrap()
            );
        }
        anyhow::Ok(())
    }
}
