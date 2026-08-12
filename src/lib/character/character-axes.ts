/**
 * 角色双轴(戏份/道德/秩序)与兼容 role 的派生/归一逻辑。
 *
 * i18n: label 文案已迁到 character.axesLabels.*;运行时通过 getT() 解析。
 * 双重用途:UI 与 prompt builder(context-builder/relation-extractor 等)共用同一标签;
 * 翻译后 AI 看到本地化标签(项目约定 UI 优先)。
 */
import type {
  Character,
  CharacterMoralAxis,
  CharacterOrderAxis,
  CharacterRole,
  CharacterRoleWeight,
} from '../types'
import { getT } from '../../i18n'

/** 戏份权重 → 静态 i18n key(避免运行时拼接)。 */
const ROLE_WEIGHT_LABEL_KEYS = {
  main: 'character:axesLabels.roleWeightMain',
  secondary: 'character:axesLabels.roleWeightSecondary',
  npc: 'character:axesLabels.roleWeightNpc',
  extra: 'character:axesLabels.roleWeightExtra',
} as const satisfies Record<CharacterRoleWeight, string>

const MORAL_AXIS_LABEL_KEYS = {
  good: 'character:axesLabels.moralGood',
  neutral: 'character:axesLabels.moralNeutral',
  evil: 'character:axesLabels.moralEvil',
} as const satisfies Record<CharacterMoralAxis, string>

const ORDER_AXIS_LABEL_KEYS = {
  lawful: 'character:axesLabels.orderLawful',
  neutral: 'character:axesLabels.orderNeutral',
  chaotic: 'character:axesLabels.orderChaotic',
} as const satisfies Record<CharacterOrderAxis, string>

/** 所有 axesLabels i18n key 的联合类型(从静态 map 派生)。 */
type AxesLabelKey =
  | typeof ROLE_WEIGHT_LABEL_KEYS[keyof typeof ROLE_WEIGHT_LABEL_KEYS]
  | typeof MORAL_AXIS_LABEL_KEYS[keyof typeof MORAL_AXIS_LABEL_KEYS]
  | typeof ORDER_AXIS_LABEL_KEYS[keyof typeof ORDER_AXIS_LABEL_KEYS]

/**
 * 窄化 t() 调用:只接受已知 axesLabels key。
 * 入参已由静态 map 约束,key 必为合法 i18n key;cast 仅绕过 TS 对
 * Record[K] 索引时把字面量联合宽化为模板字符串的限制。
 */
function tAxes(key: AxesLabelKey): string {
  return (getT() as any)(key)
}

/** 获取戏份权重的本地化 label。 */
export function getRoleWeightLabel(weight: CharacterRoleWeight): string {
  const k = ROLE_WEIGHT_LABEL_KEYS[weight]
  const v = tAxes(k)
  return typeof v === 'string' && v !== k ? v : weight
}

/** 获取道德轴的本地化 label。 */
export function getMoralAxisLabel(axis: CharacterMoralAxis): string {
  const k = MORAL_AXIS_LABEL_KEYS[axis]
  const v = tAxes(k)
  return typeof v === 'string' && v !== k ? v : axis
}

/** 获取秩序轴的本地化 label。 */
export function getOrderAxisLabel(axis: CharacterOrderAxis): string {
  const k = ORDER_AXIS_LABEL_KEYS[axis]
  const v = tAxes(k)
  return typeof v === 'string' && v !== k ? v : axis
}

/**
 * 兼容旧 API:返回当前语言下的 label record。
 * 注意:每次调用都重新解析,适合在渲染/prompt 构建时使用;
 * 不要在模块顶层缓存(否则切换语言不会刷新)。
 */
export function getRoleWeightLabels(): Record<CharacterRoleWeight, string> {
  return {
    main: getRoleWeightLabel('main'),
    secondary: getRoleWeightLabel('secondary'),
    npc: getRoleWeightLabel('npc'),
    extra: getRoleWeightLabel('extra'),
  }
}

export function getMoralAxisLabels(): Record<CharacterMoralAxis, string> {
  return {
    good: getMoralAxisLabel('good'),
    neutral: getMoralAxisLabel('neutral'),
    evil: getMoralAxisLabel('evil'),
  }
}

export function getOrderAxisLabels(): Record<CharacterOrderAxis, string> {
  return {
    lawful: getOrderAxisLabel('lawful'),
    neutral: getOrderAxisLabel('neutral'),
    chaotic: getOrderAxisLabel('chaotic'),
  }
}

/** @deprecated 使用 getRoleWeightLabels()/getRoleWeightLabel()。保留仅为编译期兼容,运行时会抛错提示迁移。 */
export const ROLE_WEIGHT_LABELS: Record<CharacterRoleWeight, string> = new Proxy({} as Record<CharacterRoleWeight, string>, {
  get(_t, prop) {
    if (typeof prop === 'string' && (prop as CharacterRoleWeight) in ROLE_WEIGHT_LABEL_KEYS) {
      return getRoleWeightLabel(prop as CharacterRoleWeight)
    }
    return undefined
  },
})

/** @deprecated 使用 getMoralAxisLabels()/getMoralAxisLabel()。 */
export const MORAL_AXIS_LABELS: Record<CharacterMoralAxis, string> = new Proxy({} as Record<CharacterMoralAxis, string>, {
  get(_t, prop) {
    if (typeof prop === 'string' && (prop as CharacterMoralAxis) in MORAL_AXIS_LABEL_KEYS) {
      return getMoralAxisLabel(prop as CharacterMoralAxis)
    }
    return undefined
  },
})

/** @deprecated 使用 getOrderAxisLabels()/getOrderAxisLabel()。 */
export const ORDER_AXIS_LABELS: Record<CharacterOrderAxis, string> = new Proxy({} as Record<CharacterOrderAxis, string>, {
  get(_t, prop) {
    if (typeof prop === 'string' && (prop as CharacterOrderAxis) in ORDER_AXIS_LABEL_KEYS) {
      return getOrderAxisLabel(prop as CharacterOrderAxis)
    }
    return undefined
  },
})

export const ROLE_WEIGHTS = Object.keys(ROLE_WEIGHT_LABEL_KEYS) as CharacterRoleWeight[]
export const MORAL_AXES = Object.keys(MORAL_AXIS_LABEL_KEYS) as CharacterMoralAxis[]
export const ORDER_AXES = Object.keys(ORDER_AXIS_LABEL_KEYS) as CharacterOrderAxis[]

const LEGACY_ROLES: CharacterRole[] = [
  'protagonist', 'antagonist', 'supporting', 'minor', 'npc', 'extra',
]

export function deriveCharacterRole(
  roleWeight: CharacterRoleWeight,
  moralAxis: CharacterMoralAxis,
): CharacterRole {
  if (roleWeight === 'secondary') return 'minor'
  if (roleWeight === 'npc') return 'npc'
  if (roleWeight === 'extra') return 'extra'
  if (moralAxis === 'good') return 'protagonist'
  if (moralAxis === 'evil') return 'antagonist'
  return 'supporting'
}

export function axesFromLegacy(
  role: CharacterRole,
  alignment?: 'good' | 'evil',
): Pick<Character, 'roleWeight' | 'moralAxis' | 'orderAxis' | 'role'> {
  const roleWeight: CharacterRoleWeight =
    role === 'protagonist' || role === 'antagonist' || role === 'supporting'
      ? 'main'
      : role === 'minor'
        ? 'secondary'
        : role
  const moralAxis: CharacterMoralAxis =
    role === 'protagonist'
      ? 'good'
      : role === 'antagonist'
        ? 'evil'
        : alignment === 'good' || alignment === 'evil'
          ? alignment
          : 'neutral'
  return { roleWeight, moralAxis, orderAxis: 'neutral', role }
}

export function isCompleteCharacterAxes(
  value: Record<string, unknown>,
): value is Record<string, unknown> & {
  roleWeight: CharacterRoleWeight
  moralAxis: CharacterMoralAxis
  orderAxis: CharacterOrderAxis
} {
  return ROLE_WEIGHTS.includes(value.roleWeight as CharacterRoleWeight)
    && MORAL_AXES.includes(value.moralAxis as CharacterMoralAxis)
    && ORDER_AXES.includes(value.orderAxis as CharacterOrderAxis)
}

/**
 * 补全角色双轴并刷新兼容 role。
 * - 完整新轴：以新轴为准派生 role。
 * - 纯旧 role：按 R1 迁移表转换。
 * - 定点更新：可传 fallback，用旧记录补齐未改动的轴。
 * - 半套新轴且无 fallback：原样返回，交给 AdoptionSchema 必填校验拒绝。
 */
export function normalizeCharacterAxes(
  value: Record<string, unknown>,
  fallback?: Record<string, unknown>,
): Record<string, unknown> {
  const combined = { ...(fallback ?? {}), ...value }
  if (isCompleteCharacterAxes(combined)) {
    return {
      ...value,
      roleWeight: combined.roleWeight,
      moralAxis: combined.moralAxis,
      orderAxis: combined.orderAxis,
      role: deriveCharacterRole(combined.roleWeight, combined.moralAxis),
    }
  }

  const hasAnyNewAxis = ['roleWeight', 'moralAxis', 'orderAxis']
    .some(field => Object.prototype.hasOwnProperty.call(value, field))
  const role = combined.role
  if (!hasAnyNewAxis && LEGACY_ROLES.includes(role as CharacterRole)) {
    return {
      ...value,
      ...axesFromLegacy(role as CharacterRole, combined.alignment as 'good' | 'evil' | undefined),
    }
  }
  return value
}

export function characterAxesLabel(
  character: Pick<Character, 'roleWeight' | 'moralAxis' | 'orderAxis'>,
): string {
  return `${getRoleWeightLabel(character.roleWeight)} · ${getOrderAxisLabel(character.orderAxis)}${getMoralAxisLabel(character.moralAxis)}`
}

export function moralAxisColor(moralAxis: CharacterMoralAxis): string {
  if (moralAxis === 'good') return '#22c55e'
  if (moralAxis === 'evil') return '#ef4444'
  return '#94a3b8'
}

export function filterCharactersByRoleWeight<T extends Pick<Character, 'roleWeight'>>(
  characters: T[],
  roleWeight: CharacterRoleWeight,
): T[] {
  return characters.filter(character => character.roleWeight === roleWeight)
}
