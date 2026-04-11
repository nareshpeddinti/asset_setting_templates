import type { FieldsetData } from "@/app/page"

/**
 * Labels for one logical fieldset key across clients (same key, different display names).
 * `primary` is the first distinct name in client order; `extraCount` is additional distinct names.
 */
export function fieldsetPrimaryAndExtraCount(
  fieldsetKey: string,
  fieldsetsByClient: Record<string, Record<string, FieldsetData>> | undefined,
  clientOrder: readonly string[],
  fallbackFieldsets: Record<string, FieldsetData>
): { primary: string; extraCount: number; tooltipLines: string[] } {
  if (!fieldsetsByClient) {
    const primary =
      fallbackFieldsets[fieldsetKey]?.name?.trim() || fieldsetKey
    return { primary, extraCount: 0, tooltipLines: [] }
  }

  const tooltipLines: string[] = []
  const namesInOrder: string[] = []
  for (const c of clientOrder) {
    const n = fieldsetsByClient[c]?.[fieldsetKey]?.name?.trim()
    if (n) {
      namesInOrder.push(n)
      tooltipLines.push(`${c}: ${n}`)
    }
  }

  if (namesInOrder.length === 0) {
    const primary =
      fallbackFieldsets[fieldsetKey]?.name?.trim() || fieldsetKey
    return { primary, extraCount: 0, tooltipLines: [] }
  }

  const unique = [...new Set(namesInOrder)]
  if (unique.length <= 1) {
    return { primary: unique[0]!, extraCount: 0, tooltipLines }
  }

  return {
    primary: unique[0]!,
    extraCount: unique.length - 1,
    tooltipLines,
  }
}

/** Every client’s display name for one fieldset key (same row in the Fieldsets table). */
export function fieldsetLabelsForAllClients(
  fieldsetKey: string,
  fieldsetsByClient: Record<string, Record<string, FieldsetData>> | undefined,
  clientOrder: readonly string[],
  fallbackFieldsets: Record<string, FieldsetData>
): { client: string; name: string }[] {
  if (!fieldsetsByClient) {
    const name = fallbackFieldsets[fieldsetKey]?.name?.trim() || fieldsetKey
    return [{ client: "", name }]
  }
  return clientOrder.map((c) => ({
    client: c,
    name: fieldsetsByClient[c]?.[fieldsetKey]?.name?.trim() || "—",
  }))
}
