import type { AssetTemplate } from "@/components/asset-templates-table"

export const PROJECT_QUERY_PARAM = "project" as const

/**
 * Each project is assigned to exactly one non-default template via `assignedProjects`.
 * Falls back to the default template when no explicit assignment exists.
 */
export function resolveTemplateIdForProject(
  projectId: string,
  templates: AssetTemplate[]
): string {
  const assigned = templates.find((t) => t.assignedProjects?.includes(projectId))
  if (assigned) return assigned.id
  const fallback = templates.find((t) => t.isDefault)
  return fallback?.id ?? templates[0]?.id ?? "template-default"
}
