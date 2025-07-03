export type HydrationErrorState = {
  // Hydration warning template format: <message> <serverContent> <clientContent>
  warning?: string
  reactOutputComponentDiff?: string
}
