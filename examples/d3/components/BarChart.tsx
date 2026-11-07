import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface BarChartProps {
  data: number[];
}

export default function BarChart({ data }: BarChartProps) {
  const chartRef = useRef(null);

  useEffect(() => {
    const margin = { top: 20, right: 20, bottom: 30, left: 40 };
    const width = 400 - margin.left - margin.right;
    const height = 200 - margin.top - margin.bottom;

    const svg = d3
      .select(chartRef.current)
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Set the scales
    const xScale = d3.scaleLinear().domain([0, data.length]).range([0, width]);

    const yScale = d3
      .scaleLinear()
      .domain([0, d3.max(data) || 0])
      .range([height, 0]);

    // Create x-axis
    svg
      .append("g")
      .attr("transform", `translate(0, ${height})`)
      .call(d3.axisBottom(xScale));

    // Create y-axis
    svg.append("g").call(d3.axisLeft(yScale));

    // Create bars with space and different colors
    svg
      .selectAll("rect")
      .data(data)
      .enter()
      .append("rect")
      .attr("x", (d, i) => xScale(i) + 5) // Add space between bars
      .attr("y", (d) => yScale(d))
      .attr("width", 65) // Reduce the width of bars
      .attr("height", (d) => height - yScale(d))
      .attr("fill", (d, i) => (i % 2 === 0 ? "blue" : "green")); // Alternate colors
  }, [data]);

  return <svg ref={chartRef} />;
}
