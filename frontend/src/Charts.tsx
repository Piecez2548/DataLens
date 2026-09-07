import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import type { Analysis, Column } from "./types";
const colors = ["#5d62e8", "#35a99b", "#e0a748", "#d27b9b", "#7e99bb"];
export default function Charts({
  data,
  column,
}: {
  data: Analysis;
  column: Column;
}) {
  const histogram = column.type === "numeric";
  const values = histogram ? column.histogram : column.categories;
  const types = Object.entries(
    data.columns.reduce<Record<string, number>>(
      (acc, c) => ({ ...acc, [c.type]: (acc[c.type] || 0) + 1 }),
      {},
    ),
  ).map(([name, value]) => ({ name, value }));
  return (
    <div className="chart-grid">
      <section className="panel">
        <div className="section-title">
          <div>
            <h3>{histogram ? "Value distribution" : "Most frequent values"}</h3>
            <p>
              {column.name} · {histogram ? "Histogram" : "Top 10 categories"}
            </p>
          </div>
          <span className="badge">{column.type}</span>
        </div>
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={values}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                interval="preserveStartEnd"
              />
              <YAxis allowDecimals={false} width={40} />
              <Tooltip
                contentStyle={{
                  background: "var(--panel)",
                  borderColor: "var(--border)",
                  color: "var(--text)",
                }}
              />
              <Bar dataKey="count" fill="#6866ea" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h3>Column composition</h3>
            <p>Inferred schema across the dataset</p>
          </div>
        </div>
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={types}
                dataKey="value"
                nameKey="name"
                innerRadius={62}
                outerRadius={88}
                paddingAngle={4}
              >
                {types.map((t, i) => (
                  <Cell key={t.name} fill={colors[i % colors.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="panel wide">
        <div className="section-title">
          <div>
            <h3>Numeric relationship</h3>
            <p>
              {data.scatter_axes.length === 2
                ? `${data.scatter_axes.join(" × ")} · first 500 complete pairs`
                : "Upload at least two numeric columns to see a scatter plot"}
            </p>
          </div>
        </div>
        {data.scatter.length ? (
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ bottom: 20, right: 20 }}>
                <CartesianGrid stroke="var(--border)" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name={data.scatter_axes[0]}
                  label={{ value: data.scatter_axes[0], position: "bottom" }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name={data.scatter_axes[1]}
                  width={60}
                />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Scatter
                  data={data.scatter}
                  fill="#6866ea"
                  fillOpacity={0.65}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="chart-empty">No numeric pairs available</div>
        )}
      </section>
    </div>
  );
}
