import { nextTestSetup } from 'e2e-utils'
import fs from 'fs/promises'
import path from 'path'
import { getPnpmRealpathWorkaround } from '../../../lib/pnpm-realpath-workaround'
import {
  executedFunctionNames,
  readTaskExecutions,
  type TaskExecution,
} from './turbo-tasks-trace'

// The Turbopack filesystem cache for `next build` should be portable: moving
// the project to another directory must not invalidate it.
//
// Every build runs with `NEXT_TURBOPACK_TRACING=turbo-tasks`, which records a
// span for every turbo-tasks function execution. A function that executes in a
// warm build was not served from the cache. The snapshots list the functions
// that execute in a warm build:
//   - in the same directory (baseline), and
//   - after moving the project, including its `.next` cache, to another
//     directory.
//
// The cache is not fully portable yet, so the "moved" snapshot documents the
// functions that are currently re-executed. When the snapshots move:
//   - FEWER entries → that's a win. Run with `-u` and commit the new snapshot.
//   - MORE entries → something regressed. Investigate before updating.
//
// TODO(deploy-test-completion): This suite inspects local build artifacts and
// moves the local fixture, which deploy tests do not support.
// @force-gate !deploy
// @force-gate turbopack
// @force-gate start
describe('turbopack-portable-build-cache', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/minimal'),
    overrideFiles: getPnpmRealpathWorkaround(),
    skipStart: true,
  })

  const env = {
    NEXT_TURBOPACK_TRACING: 'turbo-tasks',
    // Persist even tiny snapshots so the test doesn't depend on the
    // minimum-compilation-time threshold.
    TURBO_ENGINE_IGNORE_DIRTY: '1',
    TURBO_ENGINE_SNAPSHOT_MIN_ACTIVE_TIME_MILLIS: '0',
  }

  async function tracedBuild(): Promise<TaskExecution[]> {
    const { exitCode, cliOutput } = await next.build({ env })
    if (exitCode !== 0) {
      throw new Error(`next build exited with ${exitCode}:\n${cliOutput}`)
    }
    return readTaskExecutions(
      path.join(next.testDir, '.next-profiles', 'trace-turbopack.bin')
    )
  }

  /** Move the project, including its `.next` cache, to a new directory. */
  async function moveProject() {
    const from = next.testDir
    const to = `${from}-moved`
    await fs.rename(from, to)
    // The harness runs builds in and cleans up `next.testDir`.
    next.testDir = to
  }

  it('reuses the build cache after moving the project', async () => {
    const coldExecutions = await tracedBuild()
    // Sanity check that the trace contains task executions at all, so empty
    // snapshots below mean "fully cached", not "nothing was traced".
    expect(coldExecutions.length).toBeGreaterThan(10_000)

    const sameDirExecutions = await tracedBuild()
    expect(executedFunctionNames(sameDirExecutions)).toMatchInlineSnapshot(`
     [
       "<DiskFileSystem as FileSystem>::raw_read_dir",
       "<DiskFileSystem as FileSystem>::read",
       "<DiskFileSystem as FileSystem>::read_link",
       "<NftJsonAsset as Asset>::content",
       "<ServerNftJsonAsset as Asset>::content",
       "<SourceMapReference as GenerateSourceMap>::generate_source_map",
       "EcmascriptClientReferenceModule::proxy_module",
       "EcmascriptModuleContent::new",
       "EcmascriptModuleContent::new_merged",
       "Environment::runtime_versions",
       "NodeJsEnvironment::runtime_versions",
       "Project::ci_has_next_support",
       "Project::client_compile_time_info",
       "Project::current_node_js_version",
       "Project::deferred_entries",
       "Project::edge_compile_time_info",
       "Project::emit_all_output_assets",
       "Project::encryption_key",
       "Project::entrypoints_with_app_route_filter",
       "Project::env",
       "Project::is_watch_enabled",
       "Project::next_config",
       "Project::next_mode",
       "Project::no_mangling",
       "Project::node_root",
       "Project::output_fs",
       "Project::per_page_module_graph",
       "Project::project_fs",
       "Project::project_path",
       "Project::server_compile_time_info",
       "Project::should_write_nft_manifests",
       "Project::should_write_routes_hashes_manifest",
       "ProjectContainer::project",
       "analyze_ecmascript_module",
       "client_directive_transform_plugin",
       "compute_ecmascript_module_exports",
       "compute_ecmascript_module_side_effects",
       "emit_all_output_assets_once_with_issues_operation",
       "get_all_written_entrypoints_with_issues_operation",
       "lint_transform_plugin",
       "modularize_imports_transform_plugin",
       "next_cjs_optimizer_transform_plugin",
       "next_debug_instant_stack_transform_plugin",
       "next_dynamic_transform_plugin",
       "next_font_transform_plugin",
       "next_pure_transform_plugin",
       "next_react_server_components_transform_plugin",
       "next_server_actions_transform_plugin",
       "parse",
       "parse_actions",
       "project_root_path_operation",
       "styled_jsx_transform_plugin",
       "uppercase_env_map",
     ]
    `)

    await moveProject()
    const movedExecutions = await tracedBuild()
    expect(executedFunctionNames(movedExecutions)).toMatchInlineSnapshot(`
     [
       "<DiskFileSystem as FileSystem>::raw_read_dir",
       "<DiskFileSystem as FileSystem>::read",
       "<DiskFileSystem as FileSystem>::read_link",
       "<DiskFileSystem as FileSystem>::write",
       "<DiskFileSystem as turbo_tasks :: ValueToString>::to_string",
       "<NftJsonAsset as Asset>::content",
       "<ServerNftJsonAsset as Asset>::content",
       "<SourceMapReference as GenerateSourceMap>::generate_source_map",
       "DiskFileSystem::new_internal",
       "EcmascriptClientReferenceModule::proxy_module",
       "EcmascriptModuleContent::new",
       "EcmascriptModuleContent::new_merged",
       "Environment::runtime_versions",
       "NextConfig::asset_suffix_path",
       "NextConfig::base_path",
       "NextConfig::bundle_pages_router_dependencies",
       "NextConfig::cache_handler",
       "NextConfig::cache_handlers",
       "NextConfig::cache_kinds",
       "NextConfig::client_source_maps",
       "NextConfig::client_static_folder_name",
       "NextConfig::compiler",
       "NextConfig::computed_asset_prefix",
       "NextConfig::config_file_path",
       "NextConfig::cross_origin",
       "NextConfig::css_chunking",
       "NextConfig::dist_dir",
       "NextConfig::dist_dir_root",
       "NextConfig::enable_cache_components",
       "NextConfig::enable_concurrent_router_queue",
       "NextConfig::enable_durable_use_cache_entries",
       "NextConfig::enable_expose_testing_api_in_production_build",
       "NextConfig::enable_immutable_assets",
       "NextConfig::enable_react_production_profiling",
       "NextConfig::enable_taint",
       "NextConfig::enable_use_cache",
       "NextConfig::experimental_sri",
       "NextConfig::experimental_swc_env_options",
       "NextConfig::experimental_swc_plugins",
       "NextConfig::experimental_turbopack_local_postcss_config",
       "NextConfig::experimental_turbopack_use_builtin_babel",
       "NextConfig::experimental_turbopack_use_builtin_sass",
       "NextConfig::explicit_parallel_route_children",
       "NextConfig::from_string",
       "NextConfig::image_config",
       "NextConfig::import_externals",
       "NextConfig::inline_css",
       "NextConfig::instrumentation_client_inject",
       "NextConfig::is_global_not_found_enabled",
       "NextConfig::is_standalone",
       "NextConfig::is_using_adapter",
       "NextConfig::lightningcss_feature_flags",
       "NextConfig::mdx_rs",
       "NextConfig::modularize_imports",
       "NextConfig::module_fragments_enabled_for_foreign_code",
       "NextConfig::module_fragments_enabled_for_user_code",
       "NextConfig::module_ids",
       "NextConfig::optimize_package_imports",
       "NextConfig::output",
       "NextConfig::output_file_tracing_excludes",
       "NextConfig::output_file_tracing_includes",
       "NextConfig::output_hash_salt",
       "NextConfig::page_extensions",
       "NextConfig::react_compiler_options",
       "NextConfig::report_system_env_inlining",
       "NextConfig::resolve_alias_options",
       "NextConfig::resolve_extension",
       "NextConfig::rust_react_compiler",
       "NextConfig::sass_config",
       "NextConfig::server_external_packages",
       "NextConfig::server_source_maps",
       "NextConfig::should_append_server_deployment_id_at_runtime",
       "NextConfig::skip_proxy_url_normalize",
       "NextConfig::skip_trailing_slash_redirect",
       "NextConfig::strict_route_matching",
       "NextConfig::transpile_packages",
       "NextConfig::turbo_client_minify",
       "NextConfig::turbo_nested_async_chunking",
       "NextConfig::turbo_scope_hoisting",
       "NextConfig::turbo_server_minify",
       "NextConfig::turbo_shared_runtime",
       "NextConfig::turbopack_chunk_loading_global",
       "NextConfig::turbopack_chunking",
       "NextConfig::turbopack_cjs_scope_hoisting",
       "NextConfig::turbopack_cjs_tree_shaking",
       "NextConfig::turbopack_cross_module_constants",
       "NextConfig::turbopack_debug_ids",
       "NextConfig::turbopack_generate_component_chunks",
       "NextConfig::turbopack_ignore_issue_rules",
       "NextConfig::turbopack_import_type_bytes",
       "NextConfig::turbopack_infer_module_side_effects",
       "NextConfig::turbopack_lazy_dynamic_imports",
       "NextConfig::turbopack_lazy_dynamic_imports_ssr",
       "NextConfig::turbopack_mangle_export_names",
       "NextConfig::turbopack_mangle_via_materialized_namespace_object",
       "NextConfig::turbopack_plugin_runtime_strategy",
       "NextConfig::turbopack_remove_unused_exports",
       "NextConfig::turbopack_remove_unused_imports",
       "NextConfig::turbopack_worker_asset_prefix",
       "NextConfig::typescript_tsconfig_path",
       "NextConfig::use_react_experimental",
       "NextConfig::webpack_rules",
       "NodeJsEnvironment::runtime_versions",
       "Project::ci_has_next_support",
       "Project::client_compile_time_info",
       "Project::current_node_js_version",
       "Project::deferred_entries",
       "Project::edge_compile_time_info",
       "Project::emit_all_output_assets",
       "Project::encryption_key",
       "Project::entrypoints_with_app_route_filter",
       "Project::env",
       "Project::is_watch_enabled",
       "Project::next_config",
       "Project::next_mode",
       "Project::no_mangling",
       "Project::node_root",
       "Project::output_fs",
       "Project::per_page_module_graph",
       "Project::project_fs",
       "Project::project_path",
       "Project::server_compile_time_info",
       "Project::should_write_nft_manifests",
       "Project::should_write_routes_hashes_manifest",
       "ProjectContainer::project",
       "analyze_ecmascript_module",
       "client_directive_transform_plugin",
       "compute_ecmascript_module_exports",
       "compute_ecmascript_module_side_effects",
       "emit_all_output_assets_once_with_issues_operation",
       "get_all_written_entrypoints_with_issues_operation",
       "inner_entrypoints_without_collectibles_operation",
       "lint_transform_plugin",
       "modularize_imports_transform_plugin",
       "next_cjs_optimizer_transform_plugin",
       "next_debug_instant_stack_transform_plugin",
       "next_dynamic_transform_plugin",
       "next_font_transform_plugin",
       "next_pure_transform_plugin",
       "next_react_server_components_transform_plugin",
       "next_server_actions_transform_plugin",
       "parse",
       "parse_actions",
       "project_root_path_operation",
       "styled_jsx_transform_plugin",
       "uppercase_env_map",
     ]
    `)
  }, 600_000)
})
