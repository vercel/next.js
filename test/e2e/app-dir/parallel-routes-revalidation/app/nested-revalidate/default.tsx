// The drawer and modal URLs only match their respective named slots. This
// explicit fallback makes those URLs complete on a direct request while soft
// navigation can continue to preserve the active children page.
export default function Default() {
  return null
}
