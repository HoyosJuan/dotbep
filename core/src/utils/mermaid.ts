import type { FlowDiagramResolved } from '../types/resolved.js'

export type RaciKey = 'responsible' | 'accountable' | 'consulted' | 'informed'

export interface FlowDiagramToMermaidOptions {
  raciKey?: RaciKey
  topologicalSort?: boolean
}

/**
 * Converts a resolved FlowDiagram to a Mermaid flowchart string.
 * Node IDs are prefixed with `_` to avoid conflicts with Mermaid reserved words
 * (e.g. "end", "start"). Quotes in labels are escaped to `#quot;`.
 *
 * Node order: start always first, end always last. If topologicalSort is enabled,
 * intermediate nodes are ordered via BFS from start for better Dagre layout.
 */
export function flowDiagramToMermaid(
  diagram: FlowDiagramResolved,
  raciKey: RaciKey = 'responsible',
  options: FlowDiagramToMermaidOptions = {},
): string {
  const { topologicalSort = false } = options
  const nid = (id: string) => `_${id}`
  const DEFAULT_COLOR = '#444444'

  const nodeEntries = Object.entries(diagram.nodes)
  const startKey = nodeEntries.find(([, n]) => n.type === 'start')?.[0]
  const endKey   = nodeEntries.find(([, n]) => n.type === 'end')?.[0]

  let orderedKeys: string[]

  if (topologicalSort && startKey) {
    const visited = new Set<string>()
    const queue   = [startKey]
    const bfs: string[] = []
    while (queue.length) {
      const key = queue.shift()!
      if (visited.has(key)) continue
      visited.add(key)
      bfs.push(key)
      for (const edge of Object.values(diagram.edges)) {
        if (edge.from === key && !visited.has(edge.to))
          queue.push(edge.to)
      }
    }
    // Append any unreachable nodes (shouldn't exist in valid diagrams)
    for (const [key] of nodeEntries) {
      if (!visited.has(key)) bfs.push(key)
    }
    orderedKeys = bfs
  } else {
    const middle = nodeEntries
      .map(([k]) => k)
      .filter(k => k !== startKey && k !== endKey)
    orderedKeys = [
      ...(startKey ? [startKey] : []),
      ...middle,
      ...(endKey ? [endKey] : []),
    ]
  }

  const lines: string[] = [`flowchart ${diagram.direction}`]

  for (const id of orderedKeys) {
    const node = diagram.nodes[id]
    if (!node) continue

    const isTerminal = node.type === 'start' || node.type === 'end'
    const rawLbl = node.type === 'decision'
      ? (node.label ?? id)
      : (node.action?.name ?? node.automation?.name ?? '')
    const lbl = rawLbl.replace(/"/g, '&quot;')
    const responsibleNames = (isTerminal || node.type === 'decision') ? [] : node[raciKey].roles.map(r => r.name)
    const fullLbl = responsibleNames.length > 0
      ? `"<b>${responsibleNames.join(' · ')}</b><br/>${lbl}"`
      : `"${lbl || id}"`

    if (isTerminal) {
      lines.push(`  ${nid(id)}([${lbl || node.type.toUpperCase()}])`)
    } else if (node.type === 'decision') {
      lines.push(`  ${nid(id)}{${fullLbl}}`)
    } else if (node.type === 'automation') {
      lines.push(`  ${nid(id)}[[${fullLbl}]]`)
    } else {
      lines.push(`  ${nid(id)}(${fullLbl})`)
    }

    const color = node[raciKey].roles[0]?.color ?? DEFAULT_COLOR
    if (isTerminal) {
      lines.push(`  style ${nid(id)} fill:#2962FF,stroke:none`)
    } else {
      lines.push(`  style ${nid(id)} fill:none,stroke:${color},stroke-width:3px`)
    }
  }

  const edgeList = topologicalSort
    ? orderedKeys.flatMap(key => Object.values(diagram.edges).filter(e => e.from === key))
    : Object.values(diagram.edges)

  for (const edge of edgeList) {
    if (edge.label) {
      lines.push(`  ${nid(edge.from)} -->|${edge.label}| ${nid(edge.to)}`)
    } else {
      lines.push(`  ${nid(edge.from)} --> ${nid(edge.to)}`)
    }
  }

  return lines.join('\n')
}
