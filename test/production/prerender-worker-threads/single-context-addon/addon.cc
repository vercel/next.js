// A deliberately non-context-aware addon. `NODE_MODULE` registers once per
// process, so loading it on the main thread and then again on a worker thread
// fails: the second `dlopen` returns the cached handle, the module constructor
// does not run again, and Node reports
//
//   Error [ERR_DLOPEN_FAILED]: Module did not self-register: '<path>'.
//
// which is the failure PR #9199 and PR #25063 both worked around by keeping
// worker threads off by default. Do not port this to Node-API or
// `NODE_MODULE_INIT`: either would make it context-aware and the tests that
// depend on it would silently start passing for the wrong reason.

#include <node.h>

namespace {

void Init(v8::Local<v8::Object> exports) {
  v8::Isolate* isolate = v8::Isolate::GetCurrent();
  v8::Local<v8::Context> context = isolate->GetCurrentContext();
  exports
      ->Set(context,
            v8::String::NewFromUtf8(isolate, "CONTEXT_AWARE").ToLocalChecked(),
            v8::Boolean::New(isolate, false))
      .Check();
}

}  // namespace

NODE_MODULE(NODE_GYP_MODULE_NAME, Init)
