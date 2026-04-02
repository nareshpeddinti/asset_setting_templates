/**
 * Query params for opening the Assets register with the detail sheet for a row.
 * Used by assembly component links (new tab) and deep-link handling in AssetsList.
 */
export const ASSET_REGISTER_QUERY = {
  template: "template",
  asset: "asset",
} as const

export function buildAssetRegisterHref(
  pathname: string,
  templateId: string,
  assetId: string
): string {
  const base = pathname && pathname.length > 0 ? pathname : "/"
  const params = new URLSearchParams()
  params.set(ASSET_REGISTER_QUERY.template, templateId)
  params.set(ASSET_REGISTER_QUERY.asset, assetId)
  return `${base}?${params.toString()}`
}
