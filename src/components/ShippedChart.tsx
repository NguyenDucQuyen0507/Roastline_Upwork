import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ORIGINS, ShippedWeek } from '../data';

const COLORS: Record<(typeof ORIGINS)[number], string> = {
  Brazil: 'var(--o-brazil)',
  Colombia: 'var(--o-colombia)',
  Ethiopia: 'var(--o-ethiopia)',
  Guatemala: 'var(--o-guatemala)',
  Kenya: 'var(--o-kenya)',
};

export function ShippedChart({ data }: { data: ShippedWeek[] }) {
  return (
    <section className="chart" aria-labelledby="chart-title">
      <div className="section-head">
        <div>
          <h2 id="chart-title">Kg shipped by origin</h2>
          <p className="muted small">Last six weeks, this week to date</p>
        </div>
      </div>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 0, left: -18, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              domain={[0, 400]}
              ticks={[0, 100, 200, 300, 400]}
              tick={{ fill: 'var(--muted)', fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: 'var(--hover)' }}
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 6,
                color: 'var(--text)',
                fontSize: 13,
              }}
              formatter={(v: number, name: string) => [`${v} kg`, name]}
            />
            <Legend
              iconType="square"
              iconSize={9}
              wrapperStyle={{ fontSize: 12 }}
              formatter={(value: string) => <span style={{ color: 'var(--muted)' }}>{value}</span>}
            />
            {ORIGINS.map((o, i) => (
              <Bar key={o} dataKey={o} stackId="kg" fill={COLORS[o]} radius={i === ORIGINS.length - 1 ? [3, 3, 0, 0] : 0} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
