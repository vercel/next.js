use std::{
    any::{Any, TypeId},
    sync::Arc,
};

use anyhow::Result;
use turbo_tasks::{
    EffectError, EffectErrorCollection, Effects, ReadRef, ResolvedVc, TryFlatJoinIterExt, Vc,
};
use turbo_tasks_fs::error::FileSystemError;

use crate::issue::{Issue, IssueFilter, PlainIssue, fs_error::FileSystemErrorIssue};

/// A wrapper around a [`Vec`] of [`Issue`]s that has a `#[must_use]` annotation.
#[must_use]
pub struct IssueCollection(pub Vec<ResolvedVc<Box<dyn Issue>>>);

/// A collection of [`PlainIssue`]s produced by applying effects and filtering.
#[turbo_tasks::value(transparent, serialization = "skip")]
pub struct PlainIssueCollection(pub Box<[ReadRef<PlainIssue>]>);

/// Applies effects, converts [`FileSystemError`]s to [`Issue`]s, and returns the raw issue [`Vc`]s.
///
/// All [`FileSystemError`]s are converted into issues (not just the first one), and if there are
/// any remaining non-[`FileSystemError`] errors, the first one is returned.
///
/// Most callers should use [`apply_effects_with_plain_issues`] instead, which also applies the
/// issue filter and converts to [`PlainIssue`]s.
pub async fn apply_effects_with_raw_issues(effects: &Effects) -> Result<IssueCollection> {
    let EffectErrorCollection(errors) = effects.apply_with_raw_errors().await?;

    let mut issues = Vec::new();
    let mut remaining_errors = Vec::new();

    for err in errors {
        let err_ref: &dyn EffectError = &*err;
        let err_ref: &dyn Any = err_ref;
        let downcast_err = if Any::type_id(err_ref) == TypeId::of::<FileSystemError>() {
            let ptr = Arc::into_raw(err);
            // SAFETY: This is just an inlined version of Arc::downcast that doesn't convert to
            // `Arc<dyn Any>` upon error.
            unsafe { Ok(Arc::from_raw(ptr.cast())) }
        } else {
            Err(err)
        };
        match downcast_err {
            Ok(fs_err) => {
                // convert to Issue
                issues.push(ResolvedVc::upcast(
                    FileSystemErrorIssue(fs_err).resolved_cell(),
                ));
            }
            Err(other_err) => {
                remaining_errors.push(other_err);
            }
        }
    }

    if !remaining_errors.is_empty() {
        // Re-throw the first non-FileSystemError
        return Err(anyhow::Error::from(
            remaining_errors.into_iter().next().unwrap(),
        ));
    }

    Ok(IssueCollection(issues))
}

#[turbo_tasks::function(operation)]
async fn filter_and_convert_issues_operation(
    issues: Vec<ResolvedVc<Box<dyn Issue>>>,
    filter: ReadRef<IssueFilter>,
) -> Result<Vc<PlainIssueCollection>> {
    let plain_issues = issues
        .iter()
        .map(async |issue| {
            if filter.matches(*issue).await? {
                Ok(Some(PlainIssue::from_issue(**issue, None).await?))
            } else {
                Ok(None)
            }
        })
        .try_flat_join()
        .await?;
    Ok(PlainIssueCollection(plain_issues.into_boxed_slice()).cell())
}

/// Applies effects, converts [`FileSystemError`]s to [`Issue`]s, filters them, and returns
/// [`PlainIssue`]s.
///
/// This is a regular async function (not a turbo-tasks function) intended to be called from a
/// top-level task (e.g. inside `tt.run()` or a `subscribe()` closure). Internally it uses an
/// operation read with strong consistency to perform the filtering and conversion.
pub async fn apply_effects_with_plain_issues(
    effects: &Effects,
    filter: ReadRef<IssueFilter>,
) -> Result<ReadRef<PlainIssueCollection>> {
    let raw_issues = apply_effects_with_raw_issues(effects).await?;
    if raw_issues.0.is_empty() {
        return Ok(ReadRef::new_owned(PlainIssueCollection(Box::from([]))));
    }
    let plain_issues = filter_and_convert_issues_operation(raw_issues.0, filter)
        .read_strongly_consistent()
        .await?;
    Ok(plain_issues)
}
