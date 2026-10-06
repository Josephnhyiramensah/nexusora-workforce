export function Skeleton({ className = '', style }) { return <div className={`sk ${className}`} style={style} />; }
export function SkeletonKPIs({ n = 4 }) {
  return <div className="kpi-grid">{Array.from({ length: n }).map((_, i) => <div key={i} className="sk sk-kpi" />)}</div>;
}
export function SkeletonTable({ rows = 6 }) {
  return <div className="table-wrap" style={{ padding: 12 }}>{Array.from({ length: rows }).map((_, i) => <div key={i} className="sk sk-row" />)}</div>;
}
