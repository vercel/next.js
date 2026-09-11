# Datadog monitors for unattended workflows

Import-ready Datadog monitor definitions covering the workflows in this
repository whose runs are not tied to intentional user input: every
workflow with a `schedule` trigger (even one that also has
`workflow_dispatch` for manual testing), and every workflow triggered only
by `workflow_run`, `issues`, or `issue_comment` events. Workflows
triggered by `pull_request`, `pull_request_target`, or `push` (which is
PR-associated here) are excluded, as are `workflow_call`-only reusables,
which inherit their caller's trigger.

## Monitors

- `failure-monitor.json`: a multi-alert `ci-pipelines alert` that triggers
  when a single run of any covered workflow has an error status
  (`@ci.status:error`), grouped by `@ci.pipeline.name` over a 15 minute
  window. There is no consecutive-failure tolerance, so the very first
  failure of a run alerts, and while the monitor stays in alert it
  renotifies once a week. The monitor recovers once the window contains no
  more errors, so a daily cron that keeps failing alerts once per day
  rather than staying open. The alert message is a single link: `Failed <workflow name>` points at the specific failed
  execution via the `ci.pipeline.url` attribute
  (`{{ cipipeline.attributes.[ci.pipeline.url] }}`). Recovery messages have
  no matching events to read attributes from, so they name the workflow via
  the group facet variable (`{{ [@ci.pipeline.name].name }}`) instead.
  No-data notifications are enabled and renotify weekly alongside alerts.
  Note that Datadog treats zero matching events as NO DATA for event-based
  monitors, and zero failures is the healthy state for this query, so the
  monitor rests in NO DATA whenever nothing is failing; a no-data
  notification can mean quiet as well as an ingestion outage. The no-data
  timeframe is 30 minutes, twice the evaluation window as Datadog
  recommends for query alerts.
- `skip-rate-monitor.json`: a formula-based `ci-pipelines alert` computing
  `skipped runs / all runs` per workflow over a trailing 1 day window. It
  warns above 95% and alerts at 100%, where every completed run was
  skipped. A high skip rate is usually benign (`retry-tests`,
  `retry-deploy-tests`, and `Allow issue participants to reopen issues`
  skip by design when there is nothing to do), but a full day of nothing
  but skips can mean a condition broke and the workflow silently stopped
  doing work. To exclude a by-design skipper, add
  `-@ci.pipeline.name:"retry-tests"` (etc.) to both variable searches. The
  monitor renotifies once a week while it stays in alert or warning, and it
  also notifies and renotifies on no data: its queries match every run, so
  a full day without any pipeline events means the GitHub integration
  itself stopped reporting, which is the one outage the failure monitor
  cannot detect. The monitor only lists workflows that had at least one
  skipped run in the window: the formula joins its two variables on the
  group, so a group must exist in both. A workflow that is absent sits at
  0% by construction, and any workflow able to cross the warning threshold
  necessarily has skipped runs and therefore appears.

Messages are intentionally minimal: the monitor name and the link carry
all the context. The notification handle sits inside each conditional
block because Datadog expects the text and the `@` notification between
the `{{#is_alert}}`-style opening and closing pair.

## Covered workflows

- [`update_react_poller.yml`](../../../.github/workflows/update_react_poller.yml)
- [`next-maintainer-auto-close.yml`](../../../.github/workflows/next-maintainer-auto-close.yml)
- [`issue_lock.yml`](../../../.github/workflows/issue_lock.yml)
- [`update_fonts_data.yml`](../../../.github/workflows/update_fonts_data.yml)
- [`rspack-nextjs-build-integration-tests.yml`](../../../.github/workflows/rspack-nextjs-build-integration-tests.yml)
- [`rspack-nextjs-dev-integration-tests.yml`](../../../.github/workflows/rspack-nextjs-dev-integration-tests.yml)
- [`rspack-update-tests-manifest.yml`](../../../.github/workflows/rspack-update-tests-manifest.yml)
- [`test_e2e_project_reset_cron.yml`](../../../.github/workflows/test_e2e_project_reset_cron.yml)
- [`update_react.yml`](../../../.github/workflows/update_react.yml)
- [`trigger_release.yml`](../../../.github/workflows/trigger_release.yml)
- [`triage.yml`](../../../.github/workflows/triage.yml)
- [`issue_reopen.yml`](../../../.github/workflows/issue_reopen.yml)
- [`pr_ci_comment.yml`](../../../.github/workflows/pr_ci_comment.yml)
- [`retry_test.yml`](../../../.github/workflows/retry_test.yml)
- [`retry_deploy_test.yml`](../../../.github/workflows/retry_deploy_test.yml)
- [`upload_preview_tarballs.yml`](../../../.github/workflows/upload_preview_tarballs.yml)

The queries match on the GitHub workflow display name, which is what
Datadog CI Visibility reports as `@ci.pipeline.name`. The name list is
inline in both queries, so when a workflow is renamed or a new unattended
workflow is added, update both JSON files.

## Importing

Replace `@slack-TODO` with the real channel handle first, then open
<https://app.datadoghq.com/monitors/create/import>, paste a file's JSON,
and save. Do this for both files.

```sh
perl -pi -e 's/@slack-TODO/@slack-real-channel/g' scripts/datadog/workflow-health/*.json
```

## Verify before relying on these

The monitor schemas come from Datadog's official API examples (the simple
and formula `ci-pipelines alert` payloads in the DataDog documentation
repo), and the message variables from Datadog's notification variables
documentation. Two things are not documented and must be checked in the CI
Pipelines explorer or on the first real alert. Note that test
notifications do not populate event-attribute variables, so they cannot
prove the failure link:

1. `startup_failure` runs: a run whose workflow file is invalid starts
   zero jobs. Confirm such runs surface as error pipeline events; if they
   never reach Datadog, the failure monitor cannot detect this failure
   class.
2. Message variables: on the first failure alert, confirm the rendered
   message contains the run URL. If `ci.pipeline.url` is absent on error
   events, the variable renders empty; fall back to linking
   `https://github.com/vercel/next.js/actions` in the message instead.
