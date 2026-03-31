import { useRouter } from "next/router";

export const CacheStrategySelector = () => {
  const router = useRouter();
  const { asPath, route } = router;
  const value = asPath.split("/")[2];

  return (
    <div className="cache-option-toggler">
      <h4>Cache option</h4>
      <select
        name="cache-option"
        onChange={(event) => {
          const newValue = event.currentTarget.value;
          const newRoute = route.replace("[cacheStrategy]", newValue);
          router.push(newRoute, undefined, { scroll: false });
        }}
        value={value}
      >
        <option value="no-cache">Without cache</option>
        <option value="memory-cache">Memory Cache</option>
        <option value="session-storage-cache">Session Storage Cache</option>
        <option value="ls-cache">Local Storage Cache</option>
      </select>
    </div>
  );
};
