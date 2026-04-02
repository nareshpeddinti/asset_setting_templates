import type { Fieldset } from "@/lib/bulk-hierarchy-types"

/** Flat leaf field list: sections first (in order), else `fields`. */
export function flattenFieldsetLeafFields(fs: Fieldset): string[] {
  if (fs.sections?.length) return fs.sections.flatMap((s) => s.fields)
  return fs.fields
}

export function updateFieldsetAtFlatIndex(fs: Fieldset, flatIdx: number, value: string): Fieldset {
  if (fs.sections?.length) {
    let remaining = flatIdx
    const sections = fs.sections.map((sec) => {
      if (remaining < sec.fields.length) {
        const nf = [...sec.fields]
        nf[remaining] = value
        remaining = -1
        return { ...sec, fields: nf }
      }
      remaining -= sec.fields.length
      return sec
    })
    const fields = sections.flatMap((s) => s.fields)
    return { ...fs, sections, fields }
  }
  return { ...fs, fields: fs.fields.map((f, idx) => (idx === flatIdx ? value : f)) }
}

export function deleteFieldsetAtFlatIndex(fs: Fieldset, flatIdx: number): Fieldset {
  if (fs.sections?.length) {
    let remaining = flatIdx
    const sections = fs.sections
      .map((sec) => {
        if (remaining < sec.fields.length) {
          const nf = sec.fields.filter((_, j) => j !== remaining)
          remaining = -1
          return { ...sec, fields: nf }
        }
        remaining -= sec.fields.length
        return sec
      })
      .filter((sec) => sec.fields.length > 0)
    const fields = sections.flatMap((s) => s.fields)
    return {
      ...fs,
      sections: sections.length ? sections : undefined,
      fields,
    }
  }
  return { ...fs, fields: fs.fields.filter((_, idx) => idx !== flatIdx) }
}
