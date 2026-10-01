// A context-aware addon. `NODE_MODULE_INIT` registers per-context, so this can
// be loaded from the main thread and from a worker thread in the same process.
// See https://nodejs.org/api/addons.html#context-aware-addons

#include <node.h>

NODE_MODULE_INIT(/* exports, module, context */) {
  v8::Isolate* isolate = context->GetIsolate();
  exports
      ->Set(context,
            v8::String::NewFromUtf8(isolate, "CONTEXT_AWARE").ToLocalChecked(),
            v8::Boolean::New(isolate, true))
      .Check();
}
