import { defineTool } from "eve/tools";
import { z } from "zod";

const conditions = ["Sunny", "Cloudy", "Rainy", "Windy"];

export default defineTool({
  description: "Get the current weather for a city.",
  inputSchema: z.object({ city: z.string().min(1) }),
  async execute({ city }) {
    return {
      city,
      condition: conditions[city.length % conditions.length],
      temperatureF: 60 + (city.length % 25),
    };
  },
});
