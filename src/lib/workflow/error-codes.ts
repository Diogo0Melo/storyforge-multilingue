/**
 * Workflow validation error codes.
 * These map to translation keys in the 'errors' namespace.
 */
export const WORKFLOW_ERRORS = {
  EMPTY_STEP_ID: 'workflow.emptyStepId',
  DUPLICATE_STEP_ID: 'workflow.duplicateStepId',
  UNSUPPORTED_VERSION: 'workflow.unsupportedVersion',
  UNKNOWN_NODE: 'workflow.unknownNode',
  DUPLICATE_NODE: 'workflow.duplicateNode',
  INVALID_POSITION: 'workflow.invalidPosition',
  MISSING_NODE: 'workflow.missingNode',
  EMPTY_EDGE_ID: 'workflow.emptyEdgeId',
  DUPLICATE_EDGE_ID: 'workflow.duplicateEdgeId',
  UNKNOWN_EDGE_SOURCE: 'workflow.unknownEdgeSource',
  UNKNOWN_EDGE_TARGET: 'workflow.unknownEdgeTarget',
  SELF_EDGE: 'workflow.selfEdge',
  EMPTY_TARGET_VARIABLE: 'workflow.emptyTargetVariable',
  INVALID_TARGET_VARIABLE: 'workflow.invalidTargetVariable',
  DUPLICATE_EDGE: 'workflow.duplicateEdge',
  CYCLE_DETECTED: 'workflow.cycleDetected',
  TOPOLOGICAL_SORT_FAILED: 'workflow.topologicalSortFailed',
  INVALID_GRAPH_VERSION: 'workflow.invalidGraphVersion',
  INVALID_NODE_OR_EDGE: 'workflow.invalidNodeOrEdge',
  INVALID_VIEWPORT: 'workflow.invalidViewport',
  INVALID_STEPS: 'workflow.invalidSteps',
  INVALID_GRAPH: 'workflow.invalidGraph',
} as const

export type WorkflowErrorCode = typeof WORKFLOW_ERRORS[keyof typeof WORKFLOW_ERRORS]

/**
 * Structured workflow validation error.
 * Callers should translate using the error code as a translation key.
 */
export interface WorkflowValidationError {
  code: WorkflowErrorCode
  params?: Record<string, string | number>
}

/**
 * Type guard for WorkflowValidationError
 */
export function isWorkflowValidationError(value: unknown): value is WorkflowValidationError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as WorkflowValidationError).code === 'string'
  )
}
