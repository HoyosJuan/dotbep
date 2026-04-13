import type { FlowDiagramResolved } from '../types/resolved.js'

export type RaciKey = 'responsible' | 'accountable' | 'consulted' | 'informed'

/**
 * Converts a resolved FlowDiagram to a Mermaid flowchart string.
 * Node IDs are prefixed with `_` to avoid conflicts with Mermaid reserved words
 * (e.g. "end", "start"). Quotes in labels are escaped to `#quot;`.
 *
 * @param diagram - Resolved flow diagram (references already expanded to objects)
 * @param raciKey - Which RACI role to use for node colour (defaults to 'responsible')
 */
export function flowDiagramToMermaid(diagram: FlowDiagramResolved, raciKey: RaciKey = 'responsible'): string {
  const nid = (id: string) => `_${id}`
  const DEFAULT_COLOR = '#444444'

  const lines: string[] = [`flowchart ${diagram.direction}`]

  for (const [id, node] of Object.entries(diagram.nodes)) {
    const isTerminal = node.type === 'start' || node.type === 'end'
    const rawLbl = node.type === 'decision'
      ? (node.label ?? id)
      : (node.action?.name ?? node.automation?.name ?? '')
    const lbl = rawLbl.replace(/"/g, '&quot;')
    const responsibleNames = (isTerminal || node.type === 'decision') ? [] : node.responsible.roles.map(r => r.name)
    const fullLbl = responsibleNames.length > 0
      ? `"<b>${responsibleNames.join(' · ')}</b><br/>${lbl}"`
      : `"${lbl || id}"`

    if (isTerminal) {
      const terminalLabel = lbl || node.type.toUpperCase()
      lines.push(`  ${nid(id)}([${terminalLabel}])`)
    } else if (node.type === 'decision') {
      lines.push(`  ${nid(id)}{${fullLbl}}`)
    } else if (node.type === 'automation') {
      lines.push(`  ${nid(id)}[[${fullLbl}]]`)
    } else {
      lines.push(`  ${nid(id)}(${fullLbl})`)
    }

    const raciRoles = node[raciKey].roles
    const color = raciRoles[0]?.color ?? DEFAULT_COLOR
    if (isTerminal) {
      lines.push(`  style ${nid(id)} fill:#2962FF,stroke:none`)
    } else {
      lines.push(`  style ${nid(id)} fill:none,stroke:${color},stroke-width:3px`)
    }
  }

  for (const edge of Object.values(diagram.edges)) {
    if (edge.label) {
      lines.push(`  ${nid(edge.from)} -->|${edge.label}| ${nid(edge.to)}`)
    } else {
      lines.push(`  ${nid(edge.from)} --> ${nid(edge.to)}`)
    }
  }

  return lines.join('\n')
}
