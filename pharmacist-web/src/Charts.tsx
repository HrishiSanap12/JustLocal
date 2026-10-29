import { KeyboardEvent, ReactNode, useEffect, useRef, useState } from "react";

// Chart colors (validated: teal + orange pass CVD and contrast checks on white).
export const SERIES = { teal: "#0E8F7E", orange: "#EB6834" };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceMax(value: number) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate * 4 >= value) ?? magnitude * 10;
  return step * 4;
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="viz-legend">
      {items.map((item) => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}
    </div>
  );
}

type Series<T> = { key: keyof T & string; label: string; color: string };

export function TrendChart<T extends { date: string }>({ data, series, height = 230, unit = "" }: { data: T[]; series: Series<T>[]; height?: number; unit?: string }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const margin = { top: 14, right: 74, bottom: 30, left: 34 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const max = niceMax(Math.max(1, ...data.flatMap((row) => series.map((s) => Number(row[s.key]) || 0))));
  const x = (index: number) => margin.left + (data.length <= 1 ? innerW / 2 : (index / (data.length - 1)) * innerW);
  const y = (value: number) => margin.top + innerH - (value / max) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 70))));
  const last = data.length - 1;

  function onMove(event: React.PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;
    setActive(Math.max(0, Math.min(last, Math.round(ratio * last))));
  }
  function onKey(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "ArrowRight") setActive((current) => Math.min(last, (current ?? -1) + 1));
    if (event.key === "ArrowLeft") setActive((current) => Math.max(0, (current ?? last + 1) - 1));
    if (event.key === "Escape") setActive(null);
  }

  // Direct labels at the line ends, nudged apart if they collide.
  const endLabels = series.map((s) => ({ ...s, value: Number(data[last]?.[s.key]) || 0, y: y(Number(data[last]?.[s.key]) || 0) }));
  endLabels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < endLabels.length; i += 1) if (endLabels[i].y - endLabels[i - 1].y < 16) endLabels[i].y = endLabels[i - 1].y + 16;

  return (
    <div className="viz" ref={wrapRef}>
      <div className="viz-toolbar">
        <Legend items={series} />
        <button className="viz-link" onClick={() => setShowTable(!showTable)}>{showTable ? "Show chart" : "View as table"}</button>
      </div>
      {showTable ? (
        <div className="viz-table-wrap">
          <table className="viz-table"><thead><tr><th>Date</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
            <tbody>{data.map((row) => <tr key={row.date}><td>{shortDate(row.date)}</td>{series.map((s) => <td key={s.key}>{Number(row[s.key]) || 0}{unit}</td>)}</tr>)}</tbody></table>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <svg width={width} height={height} role="img" aria-label={`${series.map((s) => s.label).join(" and ")} per day`} tabIndex={0} onKeyDown={onKey} onBlur={() => setActive(null)}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={margin.left} x2={margin.left + innerW} y1={y(tick)} y2={y(tick)} className="viz-grid" />
                <text x={margin.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="viz-axis">{tick}</text>
              </g>
            ))}
            {data.map((row, index) => (index % labelEvery === 0 && last - index >= Math.ceil(labelEvery * 0.75)) || index === last ? (
              <text key={row.date} x={x(index)} y={height - 8} textAnchor={index === 0 ? "start" : index === last ? "end" : "middle"} className="viz-axis">{shortDate(row.date)}</text>
            ) : null)}
            {series.map((s) => (
              <path key={s.key} d={data.map((row, index) => `${index ? "L" : "M"}${x(index)},${y(Number(row[s.key]) || 0)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {series.map((s) => (
              <circle key={`${s.key}-end`} cx={x(last)} cy={y(Number(data[last]?.[s.key]) || 0)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />
            ))}
            {endLabels.map((label) => (
              <text key={`${label.key}-label`} x={x(last) + 9} y={label.y} dy="0.32em" className="viz-direct">{label.value} {label.label.toLowerCase()}</text>
            ))}
            {active !== null && (
              <g>
                <line x1={x(active)} x2={x(active)} y1={margin.top} y2={margin.top + innerH} className="viz-crosshair" />
                {series.map((s) => <circle key={s.key} cx={x(active)} cy={y(Number(data[active][s.key]) || 0)} r={5} fill={s.color} stroke="#fff" strokeWidth={2} />)}
              </g>
            )}
            <rect x={margin.left - 10} y={margin.top} width={innerW + 20} height={innerH} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setActive(null)} />
          </svg>
          {active !== null && data[active] && (
            <div className="viz-tooltip" style={{ left: x(active) > width * 0.6 ? Math.max(0, x(active) - 172) : Math.min(width - 170, x(active) + 12), top: margin.top }}>
              <span className="viz-tooltip-title">{shortDate(data[active].date)}</span>
              {series.map((s) => (
                <span key={s.key} className="viz-tooltip-row"><i style={{ background: s.color }} /><strong>{Number(data[active][s.key]) || 0}{unit}</strong> {s.label}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function BarList({ rows, color = SERIES.teal, format = (value: number) => String(value), empty = "No data yet" }: { rows: { label: string; value: number; hint?: string }[]; color?: string; format?: (value: number) => string; empty?: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (!rows.length) return <p className="viz-empty">{empty}</p>;
  return (
    <ul className="bar-list">
      {rows.map((row) => (
        <li key={row.label} title={`${row.label}: ${format(row.value)}${row.hint ? ` · ${row.hint}` : ""}`} tabIndex={0}>
          <span className="bar-label">{row.label}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: row.value > 0 ? `${Math.max(2, (row.value / max) * 100)}%` : 0, background: color }} /></span>
          <strong className="bar-value">{format(row.value)}</strong>
        </li>
      ))}
    </ul>
  );
}

export function ColumnChart({ data, height = 170, color = SERIES.teal, label, format }: { data: { key: string; value: number | null; detail?: string }[]; height?: number; color?: string; label: string; format: (value: number) => string }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const margin = { top: 10, right: 8, bottom: 24, left: 40 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const max = niceMax(Math.max(1, ...data.map((d) => d.value ?? 0)));
  const slot = innerW / Math.max(1, data.length);
  const barW = Math.max(3, slot - 2);
  const y = (value: number) => margin.top + innerH - (value / max) * innerH;
  return (
    <div className="viz" ref={wrapRef} style={{ position: "relative" }}>
      <svg width={width} height={height} role="img" aria-label={label}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={margin.left} x2={margin.left + innerW} y1={y(max * f)} y2={y(max * f)} className="viz-grid" />
            <text x={margin.left - 8} y={y(max * f)} dy="0.32em" textAnchor="end" className="viz-axis">{format(max * f)}</text>
          </g>
        ))}
        {data.map((d, index) => {
          const value = d.value ?? 0;
          const top = y(value);
          const h = Math.max(value ? 2 : 0, margin.top + innerH - top);
          const x0 = margin.left + index * slot + (slot - barW) / 2;
          return (
            <g key={d.key} onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)}>
              <rect x={margin.left + index * slot} y={margin.top} width={slot} height={innerH} fill="transparent" />
              {h > 0 && <path d={`M${x0},${top + h} V${top + Math.min(4, h)} Q${x0},${top} ${x0 + Math.min(4, barW / 2)},${top} H${x0 + barW - Math.min(4, barW / 2)} Q${x0 + barW},${top} ${x0 + barW},${top + Math.min(4, h)} V${top + h} Z`} fill={color} opacity={active === null || active === index ? 1 : 0.45} />}
            </g>
          );
        })}
        {data.map((d, index) => index % 6 === 0 ? <text key={`l-${d.key}`} x={margin.left + index * slot + slot / 2} y={height - 6} textAnchor="middle" className="viz-axis">{d.key}</text> : null)}
      </svg>
      {active !== null && (
        <div className="viz-tooltip" style={{ left: Math.min(width - 160, Math.max(0, margin.left + active * slot)), top: 0 }}>
          <span className="viz-tooltip-title">{data[active].key}</span>
          <span className="viz-tooltip-row"><i style={{ background: color }} /><strong>{data[active].value === null ? "—" : format(data[active].value ?? 0)}</strong> {label}</span>
          {data[active].detail ? <span className="viz-tooltip-row">{data[active].detail}</span> : null}
        </div>
      )}
    </div>
  );
}

export function Panel({ title, subtitle, action, children, className = "" }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`dash-panel ${className}`}>
      <header className="dash-panel-head"><div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>{action}</header>
      {children}
    </section>
  );
}
