import { useMemo, useRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { stratify, tree, type HierarchyPointNode } from 'd3-hierarchy'
import type { Location } from '../../lib/types'
import type { PanelsKeys } from '../../i18n/generated-resources'

type NodeDatum = Location & { id: string; parentId: string | null }
type PointNode = HierarchyPointNode<NodeDatum>

const TYPE_EMOJI: Record<string, string> = {
  continent: '🌍', country: '🏯', city: '🏙️', sect: '⚔️',
  secret: '✨', ruin: '🏚️', battlefield: '🔥', nature: '🌿',
  building: '🏛️', other: '📍',
}

const TYPE_I18N_KEYS = {
  continent: 'geography.legendContinent',
  country: 'geography.legendCountry',
  city: 'geography.legendCity',
  sect: 'geography.legendSect',
  secret: 'geography.legendSecret',
  ruin: 'geography.legendRuin',
  battlefield: 'geography.legendBattlefield',
  nature: 'geography.legendNature',
  building: 'geography.legendBuilding',
  other: 'geography.legendOther',
} as const satisfies Record<string, PanelsKeys>

const NODE_COLORS: Record<string, string> = {
  continent: '#f59e0b', country: '#6366f1', city: '#22c55e',
  sect: '#ec4899', secret: '#a78bfa', ruin: '#94a3b8',
  battlefield: '#ef4444', nature: '#14b8a6', building: '#60a5fa', other: '#94a3b8',
}

interface Props {
  locations: Location[]
}

export default function LocationTreeMap({ locations }: Props) {
  const { t } = useTranslation('panels')
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [svgSize, setSvgSize] = useState({ width: 700, height: 400 })

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) setSvgSize({ width: Math.floor(w), height: Math.max(350, Math.floor(w * 0.55)) })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const treeLayout = useMemo(() => {
    if (locations.length === 0) return null

    // 添加虚拟根节点
    const allNodes: NodeDatum[] = [
      { id: '__root__', name: t('geography.world'), type: 'continent', description: '', significance: '', parentId: null, order: 0 },
      ...locations.map(l => ({
        ...l,
        parentId: l.parentId || '__root__',
      })),
    ]

    try {
      const root = stratify<NodeDatum>()
        .id(d => d.id)
        .parentId(d => d.parentId)(allNodes)

      const { width, height } = svgSize
      const margin = { top: 40, right: 20, bottom: 40, left: 20 }
      const innerW = width - margin.left - margin.right
      const innerH = height - margin.top - margin.bottom

      const layout = tree<NodeDatum>().size([innerW, innerH])
      const laidOut = layout(root)
      return { root: laidOut, margin }
    } catch {
      return null
    }
  }, [locations, svgSize])

  if (locations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-text-muted text-sm">
        {t('geography.noLocationData')}
      </div>
    )
  }

  if (!treeLayout) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-text-muted text-sm">
        {t('geography.locationHierarchyError')}
      </div>
    )
  }

  const { root, margin } = treeLayout
  const { width, height } = svgSize

  return (
    <div ref={containerRef} className="rounded-lg overflow-hidden border border-border bg-bg-base">
      <svg ref={svgRef} width={width} height={height}>
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* 连接线 */}
          {root.links().map((link, i) => {
            const source = link.source as PointNode
            const target = link.target as PointNode
            return (
              <line
                key={i}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={1.5}
              />
            )
          })}

          {/* 节点 */}
          {root.descendants().map((node, i) => {
            const d = node.data
            if (d.id === '__root__') return null
            const cx = node.x
            const cy = node.y
            const color = NODE_COLORS[d.type] ?? '#94a3b8'

            return (
              <g key={i} transform={`translate(${cx},${cy})`}>
                <circle r={16} fill={color} fillOpacity={0.2} stroke={color} strokeWidth={1.5} />
                <text y={1} textAnchor="middle" dominantBaseline="middle"
                  fontSize={14} fill={color}>
                  {TYPE_EMOJI[d.type] ?? '📍'}
                </text>
                <text y={28} textAnchor="middle" fontSize={11}
                  fill="rgba(255,255,255,0.75)" fontFamily="PingFang SC, Microsoft YaHei, sans-serif">
                  {d.name}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {/* 图例 */}
      <div className="p-3 border-t border-border flex flex-wrap gap-x-4 gap-y-1">
        {Object.entries(TYPE_EMOJI).map(([key, emoji]) => (
          <div key={key} className="flex items-center gap-1 text-xs text-text-muted">
            <span>{emoji}</span>
            <span style={{ color: NODE_COLORS[key] }}>
              {t(TYPE_I18N_KEYS[key as keyof typeof TYPE_I18N_KEYS])}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
