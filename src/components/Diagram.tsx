import type { DiagramSpec } from '../lib/course'

// Plot area: data coordinates 0–10 on both axes.
const W = 420, H = 330, L = 56, R = 400, T = 24, B = 286
const sx = (x: number) => L + (x / 10) * (R - L)
const sy = (y: number) => B - (y / 10) * (B - T)

/** Smooth path through the points (Catmull-Rom converted to cubic Béziers). */
function smooth(pts: [number, number][]) {
  const p = pts.map(([x, y]) => [sx(x), sy(y)])
  let d = `M${p[0][0]},${p[0][1]}`
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`
  }
  return d
}

type Box = { x: number; y: number; w: number; anchor: 'start' | 'end' }
const left = (b: Box) => (b.anchor === 'end' ? b.x - b.w : b.x)
const hits = (a: Box, b: Box) => Math.abs(a.y - b.y) < 13 && left(a) < left(b) + b.w && left(b) < left(a) + a.w

/** End-of-line labels, moved up or down (nearest free slot first) so they clear point labels and each other. */
function placeLabels(d: DiagramSpec) {
  const placed: Box[] = (d.points ?? []).filter(p => p.label).map(p => ({ x: sx(p.x) + 6, y: sy(p.y) - 6, w: p.label!.length * 6.5 + 2, anchor: 'start' }))
  return d.lines.map(l => {
    const [lx, ly] = l.points[l.points.length - 1]
    const anchor: Box['anchor'] = sx(lx) > R - 10 ? 'end' : 'start'
    const base = { x: Math.min(sx(lx) + 4, W - 4), y: Math.max(sy(ly) - 4, 12), w: l.label.length * 7 + 4, anchor }
    const offsets = [0, -14, 14, -28, 28, -42, 42]
    const pos = offsets.map(o => ({ ...base, y: Math.min(H - 4, Math.max(12, base.y + o)) })).find(b => !placed.some(p => hits(p, b))) ?? base
    placed.push(pos)
    return pos
  })
}

export default function Diagram({ d }: { d: DiagramSpec }) {
  const id = `ar-${d.title.replace(/\W+/g, '')}`
  const labels = placeLabels(d)
  return (
    <figure className="diagram">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${d.title}. ${d.caption ?? ''}`}>
        <defs>
          <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="d-arrowhead" />
          </marker>
        </defs>
        {(d.areas ?? []).map((a, i) => {
          const cx = a.points.reduce((s, p) => s + p[0], 0) / a.points.length
          const cy = a.points.reduce((s, p) => s + p[1], 0) / a.points.length
          return (
            <g key={`a${i}`}>
              <polygon className="d-area" points={a.points.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ')} />
              {a.label && <text className="d-area-label" x={sx(cx)} y={sy(cy) + 4} textAnchor="middle">{a.label}</text>}
            </g>
          )
        })}
        <line className="d-axis" x1={L} y1={B} x2={L} y2={T - 8} markerEnd={`url(#${id})`} />
        <line className="d-axis" x1={L} y1={B} x2={R + 8} y2={B} markerEnd={`url(#${id})`} />
        <text className="d-axis-label" x={L - 6} y={T - 12} textAnchor="start">{d.y}</text>
        <text className="d-axis-label" x={R + 8} y={B + 34} textAnchor="end">{d.x}</text>
        <text className="d-tick" x={L - 8} y={B + 14} textAnchor="end">0</text>
        {(d.points ?? []).filter(p => p.guides).map((p, i) => (
          <g key={`g${i}`}>
            <polyline className="d-guide" points={`${L},${sy(p.y)} ${sx(p.x)},${sy(p.y)} ${sx(p.x)},${B}`} />
            {p.xlabel && <text className="d-tick" x={sx(p.x)} y={B + 16} textAnchor="middle">{p.xlabel}</text>}
            {p.ylabel && <text className="d-tick" x={L - 6} y={sy(p.y) + 4} textAnchor="end">{p.ylabel}</text>}
          </g>
        ))}
        {d.lines.map((l, i) => {
          const cls = `d-line ${l.style ?? 'solid'}`
          return (
            <g key={`l${i}`}>
              {l.curve && l.points.length > 2
                ? <path className={cls} d={smooth(l.points)} />
                : <polyline className={cls} points={l.points.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ')} />}
              <text className={`d-line-label ${l.style ?? 'solid'}`} x={labels[i].x} y={labels[i].y} textAnchor={labels[i].anchor}>{l.label}</text>
            </g>
          )
        })}
        {(d.arrows ?? []).map((a, i) => (
          <line key={`r${i}`} className="d-move" x1={sx(a.from[0])} y1={sy(a.from[1])} x2={sx(a.to[0])} y2={sy(a.to[1])} markerEnd={`url(#${id})`} />
        ))}
        {(d.points ?? []).map((p, i) => (
          <g key={`p${i}`}>
            <circle className="d-point" cx={sx(p.x)} cy={sy(p.y)} r={3.5} />
            {p.label && <text className="d-point-label" x={sx(p.x) + 6} y={sy(p.y) - 6}>{p.label}</text>}
          </g>
        ))}
      </svg>
      <figcaption><strong>{d.title}.</strong> {d.caption}</figcaption>
    </figure>
  )
}
