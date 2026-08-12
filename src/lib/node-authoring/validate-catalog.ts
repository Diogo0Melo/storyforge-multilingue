import { getT } from '../../i18n'
import { ADOPTION_BY_TARGET } from '../registry/adoption-schema'
import { CONTEXT_SOURCE_BY_KEY } from '../registry/context-sources'
import { FIELD_BY_TARGET } from '../registry/field-registry'
import { REGISTRY_BY_NAME } from '../registry/project-tables'
import { AUTHORING_NODE_CATALOG } from './catalog'
import { isAuthoringSemantic, type AuthoringNodeTemplate } from './contracts'

export interface AuthoringCatalogIssue {
  code: string
  templateId?: string
  message: string
}

function issue(
  issues: AuthoringCatalogIssue[],
  code: string,
  message: string,
  templateId?: string,
) {
  issues.push({ code, templateId, message })
}

export function validateAuthoringNodeCatalog(
  catalog: readonly AuthoringNodeTemplate[] = AUTHORING_NODE_CATALOG,
  options?: { availablePromptKeys?: ReadonlySet<string> },
): AuthoringCatalogIssue[] {
  const issues: AuthoringCatalogIssue[] = []
  const ids = new Set<string>()
  const catalogIds = new Set(catalog.map(template => template.id))

  for (const template of catalog) {
    if (!template.id.trim()) issue(issues, 'empty-id', getT()('node-authoring:catalog.emptyId'))
    if (ids.has(template.id)) issue(issues, 'duplicate-id', getT()('node-authoring:catalog.duplicateId', { id: template.id }), template.id)
    ids.add(template.id)

    if (!template.inputs.length && !template.outputs.length) {
      issue(issues, 'no-ports', getT()('node-authoring:catalog.noPorts'), template.id)
    }

    for (const [direction, ports] of [['input', template.inputs], ['output', template.outputs]] as const) {
      const portIds = new Set<string>()
      for (const port of ports) {
        if (!port.id.trim() || portIds.has(port.id)) {
          issue(issues, 'invalid-port-id', getT()('node-authoring:catalog.invalidPortId', { direction, portId: port.id }), template.id)
        }
        portIds.add(port.id)
        if (!isAuthoringSemantic(port.semantic)) {
          issue(issues, 'unknown-semantic', getT()('node-authoring:catalog.unknownSemantic', { semantic: String(port.semantic) }), template.id)
        }
        if (port.maxTokens != null && (!Number.isFinite(port.maxTokens) || port.maxTokens <= 0)) {
          issue(issues, 'invalid-budget', getT()('node-authoring:catalog.invalidBudget', { portId: port.id }), template.id)
        }
      }
    }

    for (const sourceKey of template.reads?.sourceKeys ?? []) {
      if (!CONTEXT_SOURCE_BY_KEY.has(sourceKey)) {
        issue(issues, 'unknown-source', getT()('node-authoring:catalog.unknownSource', { sourceKey }), template.id)
      }
    }

    if (template.writes) {
      const { target, fields = [] } = template.writes
      if (!REGISTRY_BY_NAME.has(target)) {
        issue(issues, 'unknown-table', getT()('node-authoring:catalog.unknownTable', { target }), template.id)
      }
      const registeredFields = new Set((FIELD_BY_TARGET.get(target) ?? []).map(field => field.field))
      for (const field of fields) {
        if (!registeredFields.has(field)) {
          issue(issues, 'unknown-field', getT()('node-authoring:catalog.unknownField', { target, field }), template.id)
        }
      }
      if (!fields.length && !ADOPTION_BY_TARGET.has(target)) {
        issue(issues, 'missing-adoption-schema', getT()('node-authoring:catalog.missingAdoptionSchema', { target }), template.id)
      }
    }

    if (
      template.promptModuleKey
      && options?.availablePromptKeys
      && !options.availablePromptKeys.has(template.promptModuleKey)
    ) {
      issue(issues, 'missing-prompt', getT()('node-authoring:catalog.missingPrompt', { promptModuleKey: template.promptModuleKey }), template.id)
    }

    for (const referencedId of [
      ...(template.recommendedBefore ?? []),
      ...(template.recommendedAfter ?? []),
    ]) {
      if (!catalogIds.has(referencedId)) {
        issue(issues, 'unknown-recommendation', getT()('node-authoring:catalog.unknownRecommendation', { referencedId }), template.id)
      }
    }

    if (template.class === 'control') {
      if (template.outputs.some(port => port.state !== 'control')) {
        issue(issues, 'control-state', getT()('node-authoring:catalog.controlState'), template.id)
      }
      if (template.reads || template.writes) {
        issue(issues, 'control-governance', getT()('node-authoring:catalog.controlGovernance'), template.id)
      }
    }
  }

  return issues
}

export function assertValidAuthoringNodeCatalog(
  catalog: readonly AuthoringNodeTemplate[] = AUTHORING_NODE_CATALOG,
  options?: { availablePromptKeys?: ReadonlySet<string> },
): void {
  const issues = validateAuthoringNodeCatalog(catalog, options)
  if (issues.length) throw new Error(issues.map(item => item.message).join('\n'))
}
