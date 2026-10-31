import { t, tf } from "./i18n";
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
  LineChart,
  Line,
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
            <h3>{t(histogram ? "Value distribution" : "Most frequent values")}</h3>
            <p>
              {column.name} · {t(histogram ? "Histogram" : "Top 10 categories")}
            </p>
          </div>
          <span className="badge">{t(column.type)}</span>
        </div>
        <div className="chart" aria-hidden="true">
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
        <details className="chart-data">
          <summary>{t("View chart values as a table")}</summary>
          <table>
            <thead><tr><th>{t("Value or range")}</th><th>{t("Count")}</th></tr></thead>
            <tbody>{values.map((item) => <tr key={item.label}><td>{item.label}</td><td>{item.count}</td></tr>)}</tbody>
          </table>
        </details>
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h3>{t("Column composition")}</h3>
            <p>{t("Inferred schema across the dataset")}</p>
          </div>
        </div>
        <div className="chart" aria-hidden="true">
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
        <details className="chart-data">
          <summary>{t("View column types as a table")}</summary>
          <table>
            <thead><tr><th>{t("Detected type")}</th><th>{t("Columns")}</th></tr></thead>
            <tbody>{types.map((item) => <tr key={item.name}><td>{t(item.name)}</td><td>{item.value}</td></tr>)}</tbody>
          </table>
        </details>
      </section>
      {data.timeseries && (
        <section className="panel wide">
          <div className="section-title">
            <div>
              <h3>{t("Records over time")}</h3>
              <p>
                {data.timeseries.column} · by {data.timeseries.granularity} ·{" "}
                {data.timeseries.first} to {data.timeseries.last} ·{" "}
                {data.timeseries.gaps === 0
                  ? "no empty periods"
                  : `${data.timeseries.gaps} empty ${data.timeseries.granularity}(s)`}
              </p>
            </div>
          </div>
          <div className="chart" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.timeseries.points}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} width={40} />
                <Tooltip
                  contentStyle={{
                    background: "var(--panel)",
                    borderColor: "var(--border)",
                    color: "var(--text)",
                  }}
                />
                <Line type="monotone" dataKey="count" stroke="#6866ea" dot={data.timeseries.points.length < 40} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <details className="chart-data">
            <summary>{t("View records over time as a table")}</summary>
            <table>
              <thead><tr><th>{t("Period")}</th><th>{t("Records")}</th></tr></thead>
              <tbody>
                {data.timeseries.points.slice(0, 200).map((item) => (
                  <tr key={item.label}><td>{item.label}</td><td>{item.count}</td></tr>
                ))}
              </tbody>
            </table>
            {data.timeseries.points.length > 200 && <p>Showing the first 200 of {data.timeseries.points.length} periods.</p>}
          </details>
        </section>
      )}
      <section className="panel wide">
        <div className="section-title">
          <div>
            <h3>{t("Numeric relationship")}</h3>
            <p>
              {data.scatter_axes.length === 2
                ? tf("{axes} · first 500 complete pairs", { axes: data.scatter_axes.join(" × ") })
                : t("Upload at least two numeric columns to see a scatter plot")}
            </p>
          </div>
        </div>
        {data.scatter.length ? (
          <div className="chart" aria-hidden="true">
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
          <div className="chart-empty">{t("No numeric pairs available")}</div>
        )}
        {data.scatter.length > 0 && (
          <details className="chart-data">
            <summary>{t("View plotted pairs as a table")}</summary>
            <table>
              <thead><tr><th>{data.scatter_axes[0]}</th><th>{data.scatter_axes[1]}</th></tr></thead>
              <tbody>{data.scatter.slice(0, 100).map((item, index) => <tr key={index}><td>{item.x}</td><td>{item.y}</td></tr>)}</tbody>
            </table>
            {data.scatter.length > 100 && <p>Showing the first 100 of {data.scatter.length} plotted pairs.</p>}
          </details>
        )}
      </section>
    </div>
  );
}
