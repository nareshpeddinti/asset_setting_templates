# PRD: Asset Classification Templates (Templates-Only)

## 1. Overview

This PRD defines Asset Classification Templates for company-level configuration and project-level assignment. The goal is to let General Contractors support client-specific asset schemas without changing the company-wide standard for every project.

This document is intentionally scoped to templates and template-copy behavior only.

## 2. Problem Statement

The current single-library model creates friction for GCs managing many clients and project types in one Procore instance. Similar physical assets often require different codes, fieldsets, and grouping structures by client. Teams need project-level flexibility while preserving a clean company baseline.

## 3. Scope

### In Scope

- Template lifecycle: create, copy, assign, set default, delete.
- Template table/log visibility: name, created by, last modified, assigned projects.
- Copy from template behavior:
  - Copy all or selected branches.
  - Copy with or without fieldsets.
  - Apply mode: replace or merge.
- Project resolution behavior for templates (explicit assignment first, then default fallback).
- Company-level asset creation requires template selection to load fieldsets.
- Company-level asset list supports filtering by template.
- Asset-to-project assignment enforces template compatibility.

### Out of Scope

- Bulk create/import/export workflows.
- Export format and handover output workflows.
- Non-template asset register features.

## 4. Users

- Company Admin: creates and governs templates.
- Project Admin: consumes assigned template configuration.

## 5. Feature Requirements (Unified)

This section combines functional requirements, behavior rules, and user acceptance criteria feature-by-feature.

### 5.0 Templates Table

**Behavior**
- The templates page shows all templates in a table view.
- The table shows key columns: template name, created by, last modified date, and assigned projects count.
- Default template is clearly labeled.
- Each row provides quick actions: Edit, Copy, Set as Default, Delete, and Assign Projects.
- The template name is clickable and opens template editing.

**User Acceptance Criteria**
- Given I open the templates page, when templates exist, then I can see all templates in a table with key metadata.
- Given one template is default, when I view the table, then that template is visibly marked as default.
- Given I click the assigned projects value for a template, when the dialog opens, then I can assign or unassign projects and save.
- Given I use a row action, when I confirm the action, then the table reflects the updated template state.

### 5.1 Create Template

**Behavior**
- Assets Admin can create a template with a name and optionally mark it as the default template.
- A newly created template starts with no assigned projects.
- If a new template is marked as default, the previous default template is automatically removed from default status.

**User Acceptance Criteria**
- Given I am on the templates page, when I create a template with a valid name, then the template appears in the table with no assigned projects.
- Given I create a new template as default, when I save, then any previous default template is unset and the new one is the only default.

### 5.2 Edit Template

**Behavior**
- Company Admin can open a template and edit metadata/settings.
- Saving updates the last modified date and shows changes in both the template list and detail view.
- There is no dedicated "template view-only mode" requirement in this PRD.

**User Acceptance Criteria**
- Given I open a template for editing, when I change template values and save, then the updated values and last-modified timestamp are visible.

### 5.3 Copy Template (List-Level Duplicate)

**Behavior**
- Copy action creates a duplicate template row.
- The copied template is not default and has no assigned projects.

**User Acceptance Criteria**
- Given I click Copy on an existing template, when copy completes, then a new template is added with copied configuration and no assigned projects.

### 5.4 Assign Projects

**Behavior**
- Company Admin can assign one template to many projects from the Assign Projects dialog.
- One template can be assigned to multiple projects.
- Each project must have exactly one assigned template at any point in time.
- Assigned project count is shown in the templates table.
- Reassigning a project to a different template is allowed only when that project has no assets created.

**User Acceptance Criteria**
- Given I select projects in Assign Projects and save, when I return to the table, then assigned project count matches saved selection.
- Given a project is already assigned to another template and has no assets, when I assign it to a new template, then it is removed from the previous template and assigned to the new template.
- Given a project already has one or more assets, when I attempt to change its template assignment, then the system blocks the change and shows a clear message explaining why.

### 5.5 Set Default Template

**Behavior**
- The system provides one standard template as the baseline default template.
- Only one template can be default at a time in current UI flow.
- Default is used as fallback when a project has no explicit assignment.

**Project Resolution Logic**
1. Use template explicitly assigned to the selected project.
2. Else use default template.
3. Else use first template in list.
4. Else use the built-in system fallback template.

**User Acceptance Criteria**
- Given multiple templates exist, when I set one as default, then it becomes the only default template.
- Given a project with no explicit assignment, when template resolves, then the default template is used.

### 5.6 Delete Template

**Behavior**
- Delete action removes non-default templates from active list.
- The system-provided standard default template cannot be deleted.
- Default template delete action is disabled in UI.
- Recycle Bin remains roadmap (not fully implemented in current flow).

**User Acceptance Criteria**
- Given the system standard default template row, when I open row actions, then Delete is disabled.
- Given a non-default template row, when I confirm deletion, then template is removed from active template list.

### 5.7 Copy From Template (Detail-Level)

**Behavior**
- User selects a source template, chooses which type branches to copy, decides whether to include fieldsets, and chooses how to apply changes.
- Source asset types are hierarchical with expand/collapse and select all/none.
- Selecting a parent includes descendants.
- Selecting a child auto-includes ancestors to preserve hierarchy.

**Fieldset Option**
- Include fieldsets = Yes
  - Relevant source fieldsets are copied.
  - For partial branch copy, only fieldsets used by selected types are copied, along with the default Procore fieldset.
- Include fieldsets = No
  - Asset types are copied, but all copied types are set to use the default Procore fieldset.
  - Source custom fieldsets are not copied.

**Apply Modes**
- Replace:
  - Matching uses type code and type name together, ignoring case and extra spaces.
  - Existing matched types and descendants are removed first.
  - Incoming selected types are then added.
  - Fieldset keys from source overwrite matching local keys; unrelated local fieldsets remain.
- Merge:
  - Existing matched types are skipped.
  - Non-duplicate incoming types are appended.
  - Fieldsets merge by key; sections union by section name; fields union within each section.

**User Acceptance Criteria**
- Given I select a branch, when I apply copy, then descendants are included and missing ancestors are auto-added.
- Given I choose not to include fieldsets, when I apply copy, then copied asset types are set to the default Procore fieldset.
- Given Replace mode and duplicate types exist, when I apply copy, then matched existing branches are replaced.
- Given Merge mode and duplicate types exist, when I apply copy, then duplicates are skipped and only new types are added.

### 5.8 Company-Level Asset Creation and Template-Based Asset Controls

**Behavior**
- At company level, users must select a template before creating an asset.
- Fieldsets shown during asset creation are populated from the selected template.
- Company-level assets list supports filtering by template so users can view assets for a specific template.
- An asset created under a specific template can only be assigned to projects that are assigned to that same template.
- If a project is not assigned to the asset's template, the system must block assignment.

**User Acceptance Criteria**
- Given I start creating an asset at company level, when I have not selected a template, then I cannot proceed to complete asset creation.
- Given I select a template during asset creation, when the form loads, then fieldsets shown are from that selected template.
- Given I am viewing company-level assets, when I apply a template filter, then only assets created under that template are shown.
- Given an asset was created using Template A, when I try to assign it to a project that is assigned to Template B, then the system blocks the assignment and shows a clear message.
- Given an asset was created using Template A, when I assign it to a project also assigned to Template A, then assignment is allowed.

## 8. UX Notes

- Copy dialog requires selecting a source template.
- If source has asset types, at least one type must be selected before apply.
- If source has no asset types, copying only fieldsets is allowed when fieldsets option is checked.
- Dialog explains replace/merge outcomes before apply.

## 9. Success Criteria (Non-numeric)

- Faster template setup for multi-client GC portfolios.
- Lower manual reconfiguration at project setup.
- Reduced schema mismatch across project handovers.
- Higher reuse of standardized template variants.

## 10. Risks and Mitigations

- Template sprawl: enforce naming and ownership conventions.
- Misassignment of projects: improve assignment warnings/preview.
- Silent drift in copied configs: add robust change history/audit trail (roadmap).
- Duplicate semantics confusion (`code + name`): show duplicate preview before apply.

## 11. Edge Cases Requiring Product Decisions

Answer these to finalize implementation behavior.

1. Project Assignment Uniqueness
   - Decision: project assignment is globally unique (exactly one template per project).
   - Rule: assigning a project to a new template must automatically remove it from any previous template.

2. Deleting Assigned Templates
   - Current delete flow does not block deletion of assigned non-default templates.
   - Question: Should delete be blocked when `assignedProjects.length > 0`?
   - Options: block / allow with forced unassign / allow and auto-fallback to default.

3. Deleting the Only Template
   - Question: Should system require at least one active template at all times?
   - Options: yes (hard guard) / no (allow empty state).

4. Default Template Constraints
   - Question: Must there always be exactly one default template?
   - Options: exactly one / zero-or-one allowed.

5. Copying with No Fieldsets
   - Current behavior resets copied types to `Procore Default`.
   - Question: Is this always required, or should users choose "keep source fieldset keys even if missing locally"?
   - Options: always reset / advanced option.

6. Branch Copy + Missing Fieldsets
   - Question: If a selected type references a source fieldset not selected/copied, should apply fail or auto-map to `Procore Default`?
   - Options: fail with validation / auto-map and warn.

7. Replace Match Key Strictness
   - Current match key is `code + name` (trimmed, case-insensitive).
   - Question: Should match be by code only, name only, or immutable type ID where available?
   - Options: keep code+name / code-only / configurable.

8. Replace Scope
   - Current replace removes matched types and descendants only.
   - Question: Should replace support "full template replace" (wipe all then copy selection)?
   - Options: branch-replace only / add full replace option.

9. Merge Conflict Visibility
   - Fieldset merge unions sections/fields silently.
   - Question: Should users get a pre-apply diff for merged fieldsets and skipped duplicate types?
   - Options: no preview / compact summary / full diff.

10. Assignment Change After Asset Data Exists
    - Decision: block assignment changes when assets already exist in the project.
    - Rule: reassignment is only allowed if asset count for that project is zero.

11. Recycle Bin Expectations
    - Recycle bin exists as concept but not full behavior.
    - Question: Do you need restore and purge semantics in v1?
    - Options: not in v1 / restore only / restore + purge + retention policy.

12. Copy Source Constraints
    - Question: Should copying from the current template itself be blocked?
    - Options: block / allow (no-op possible) / allow with warning.

13. Template Name Uniqueness
    - Question: Must template names be unique at company level?
    - Options: strict unique (case-insensitive) / allow duplicates with warning.

14. Template Name Normalization
    - Question: Should leading/trailing spaces and repeated spaces be normalized before save?
    - Options: normalize and trim / save raw input.

15. Maximum Name Length
    - Question: What is the max template name length and behavior beyond limit?
    - Options: hard block / soft warning + truncate.

16. Empty Description Handling
    - Question: Is description optional, and should empty descriptions render as blank or placeholder text?
    - Options: optional blank / required minimum text.

17. Project Assignment Race Conditions
    - Question: If two admins assign the same project concurrently, whose change wins?
    - Options: last-write-wins / optimistic locking / conflict prompt.

18. Project Deletion/Archival Impact
    - Question: What happens to template assignment when a project is archived/deleted?
    - Options: auto-remove assignment / retain historical reference / block archive until unassigned.

19. Default Template Deletion via API
    - UI disables delete for default; question: should backend also hard-block?
    - Options: hard-block always / allow only with replacement default in same transaction.

20. No Default + No Assignment Path
    - Question: If no template is default and none assigned, should app auto-pick first template?
    - Options: current fallback / force explicit admin action.

21. Source Template Without Types and Without Fieldsets
    - Question: Should copy action be disabled when source contains neither asset types nor fieldsets?
    - Options: disable apply / allow no-op with message.

22. Large Hierarchy Copy Performance
    - Question: For very large selections, do we need async processing/progress states?
    - Options: synchronous UI / async job + progress.

23. Circular Parent References in Source Data
    - Question: If malformed data contains parent cycles, how should copy behave?
    - Options: block with validation / auto-break cycle and warn.

24. Duplicate Codes Across Different Names
    - Question: Should duplicate code with different name be allowed in same template?
    - Options: allow / block / warn.

25. Duplicate Names Across Different Codes
    - Question: Should duplicate type names with different codes be allowed?
    - Options: allow / block / warn.

26. Fieldset Key Case Sensitivity
    - Question: Should `Electrical` and `electrical` be treated as same fieldset key?
    - Options: case-insensitive canonicalization / case-sensitive distinct keys.

27. Fieldset Section Name Collisions
    - Merge unions by section name; question: should section names be normalized before merge?
    - Options: exact string match / normalized match (trim + case-insensitive).

28. Field Order Preservation in Merge
    - Question: On merged fieldsets, should field order follow source, destination, or stable sort?
    - Options: destination-first / source-first / alphabetical.

29. Type Order Preservation After Copy
    - Question: Should copied types append at end or preserve source ordering slot?
    - Options: append / preserve source order grouping.

30. Replace + Partial Branch Selection Safety
    - Question: Should replace require explicit warning when parent match can remove a large subtree?
    - Options: always warn with count preview / warn only above threshold.

31. Cross-Template Fieldset Dependency
    - Question: If selected types depend on fieldsets not available locally and fieldset copy is off, fail or remap?
    - Options: force remap to `Procore Default` (current) / block and prompt user.

32. Undo for Copy Apply
    - Question: Should there be a single-click undo after copy operation?
    - Options: no undo / time-limited undo / version restore.

33. Audit Granularity for Copy
    - Question: What level should change history capture for copy actions?
    - Options: high-level event only / detailed type and fieldset diff.

34. Permission Segmentation
    - Question: Should copy/replace be restricted to elevated role while merge allowed to standard admin?
    - Options: no split / role-based split.

35. Multi-tenant Isolation Rules
    - Question: Are templates ever shareable across company instances?
    - Options: never shared / import-export package in future.

36. Reassignment of Projects with Existing Assets
    - Question: If project template changes, should existing assets keep prior schema or re-evaluate against new template?
    - Options: keep-as-is / validate and flag drift / guided migration.

37. Fallback Behavior Telemetry
    - Question: Should fallback to default/first template generate telemetry or admin alert?
    - Options: silent / telemetry only / telemetry + in-app alert.

38. Internationalization of Template/Fieldset Keys
    - Question: Can localized labels map to stable internal keys while keeping multilingual display names?
    - Options: key-label split / single locale-bound key.

## 12. Recommended v1 Decisions (Suggested Defaults)

- Enforce globally unique project-to-template assignment.
- Block template reassignment for projects that already contain assets.
- Block delete for any assigned template.
- Require one default template at all times.
- Keep `copyFieldsets` optional; when false, force `Procore Default`.
- Keep match key as `code + name` for v1, add duplicate preview.
- Keep replace as branch-replace (not full wipe).
- Add compact post-apply summary (added/skipped/replaced/fieldset updates).

## 13. Open Questions

- Should project templates carry project-level template settings by value (snapshot) or by reference?
- Should default template auto-apply at project creation only, or also when assets module is first enabled?
- Should template ownership/approval be mandatory for edits in enterprise accounts?

## 14. Assumptions

- Template governance happens at company level.
- Project admins consume assigned output rather than author company templates.
- Bulk and export remain explicitly out of scope.

