use std::cmp::Ordering;

use anyhow::Result;
use async_trait::async_trait;
use turbo_rcstr::RcStr;
use turbo_tasks::{emit, CollectiblesSource, FxIndexMap, ResolvedVc, TryJoinIterExt, Upcast, Vc};

#[turbo_tasks::value(serialization = "none")]
#[derive(Clone, Debug)]
pub struct PlainDiagnostic {
    pub category: RcStr,
    pub name: RcStr,
    pub payload: FxIndexMap<RcStr, RcStr>,
}

impl Ord for PlainDiagnostic {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.name
            .cmp(&other.name)
            .then_with(|| self.category.cmp(&other.category))
            .then_with(|| self.payload.len().cmp(&other.payload.len()))
            .then_with(|| {
                for ((a_key, a_value), (b_key, b_value)) in
                    self.payload.iter().zip(other.payload.iter())
                {
                    match a_key.cmp(b_key) {
                        Ordering::Equal => {}
                        other => return other,
                    }
                    match a_value.cmp(b_value) {
                        Ordering::Equal => {}
                        other => return other,
                    }
                }
                Ordering::Equal
            })
    }
}

impl PartialOrd for PlainDiagnostic {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

#[turbo_tasks::value(transparent)]
pub struct DiagnosticPayload(pub FxIndexMap<RcStr, RcStr>);

/// An arbitrary payload can be used to analyze, diagnose
/// Turbopack's behavior.
#[turbo_tasks::value_trait]
pub trait Diagnostic {
    /// [NOTE]: Psuedo-reserved; this is not being used currently.
    /// The `type` of the diagnostics that can be used selectively filtered by
    /// consumers. For example, this could be `telemetry`, or
    /// `slow_perf_event`, or something else. This is not strongly typed
    /// though; since consumer or implementation may need to define own
    /// category.
    fn category(&self) -> Vc<RcStr>;
    /// Name of the specific diagnostic event.
    fn name(&self) -> Vc<RcStr>;
    /// Arbitarary payload included in the diagnostic event.
    fn payload(&self) -> Vc<DiagnosticPayload>;

    async fn into_plain(self: Vc<Self>) -> Result<Vc<PlainDiagnostic>> {
        Ok(PlainDiagnostic {
            category: self.category().await?.clone_value(),
            name: self.name().await?.clone_value(),
            payload: self.payload().await?.clone_value(),
        }
        .cell())
    }
}

pub trait DiagnosticExt {
    fn emit(self);
}

impl<T> DiagnosticExt for Vc<T>
where
    T: Upcast<Box<dyn Diagnostic>>,
{
    fn emit(self) {
        let diagnostic = Vc::upcast::<Box<dyn Diagnostic>>(self);
        emit(diagnostic);
    }
}

#[async_trait]
pub trait DiagnosticContextExt
where
    Self: Sized,
{
    async fn peek_diagnostics(self) -> Result<CapturedDiagnostics>;
}

#[async_trait]
impl<T> DiagnosticContextExt for T
where
    T: CollectiblesSource + Copy + Send,
{
    async fn peek_diagnostics(self) -> Result<CapturedDiagnostics> {
        Ok(CapturedDiagnostics {
            diagnostics: self
                .peek_collectibles()
                .into_iter()
                .map(|v: Vc<Box<dyn Diagnostic>>| v.to_resolved())
                .try_join()
                .await?
                .into_iter()
                .collect(),
        })
    }
}

/// A list of diagnostics captured with
/// [`DiagnosticsVc::peek_diagnostics_with_path`] and
#[derive(Debug)]
#[turbo_tasks::value]
pub struct CapturedDiagnostics {
    pub diagnostics: auto_hash_map::AutoSet<ResolvedVc<Box<dyn Diagnostic>>>,
}
