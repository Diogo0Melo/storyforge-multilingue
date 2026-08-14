/**
 * R-I18N-P2 (fix-6) · 模拟严格 JSON 调用的语言契约回归。
 *
 * 覆盖：
 * 1. SimulationRuntimePanel 三个严格 JSON 调用点（simulation.npc-evolution、
 *    simulation.ttrpg-gm、simulation.ttrpg-encounter）显式声明
 *    outputKind: 'language-neutral'，client gate 不追加宽泛散文语言约束。
 * 2. 提示词构造器注入字段级叙事语言契约（pt-BR/en/zh-CN），只覆盖叙事字段，
 *    不触及 JSON 键、canonical 枚举、实体键、数值表达式与协议结构。
 * 3. 严格 JSON 与 JSON5 恢复后仍原样保留键/枚举/实体键，不做解析后翻译。
 * 4. JSON5 恢复不能绕过封闭集/实体/参与者/回合顺序过滤。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SupportedLang } from '../../src/i18n'
import {
  buildNpcEvolutionPrompt,
  buildSimulationNarrativeLanguageDirective,
  NPC_EVOLUTION_ATTRIBUTE_LANGUAGE_CLARIFICATION,
  NPC_EVOLUTION_NARRATIVE_FIELDS,
  parseNpcEvolutionCandidate,
} from '../../src/lib/simulation/npc-evolution'
import {
  buildTtrpgEncounterPrompt,
  buildTtrpgGmPrompt,
  parseTtrpgEncounterCandidate,
  parseTtrpgTurnCandidate,
  TTRPG_ENCOUNTER_NARRATIVE_FIELDS,
  TTRPG_GM_NARRATIVE_FIELDS,
} from '../../src/lib/simulation/ttrpg'
import { EMPTY_SIMULATION_STATE, type SimulationRuntimeState } from '../../src/lib/types'

const LANGUAGE_NAMES: Record<SupportedLang, string> = {
  'pt-BR': 'português brasileiro',
  'en': 'English',
  'zh-CN': '简体中文',
}
const LANGS = Object.keys(LANGUAGE_NAMES) as SupportedLang[]
const DIRECTIVE_HEADER = '【叙事字段语言契约】'

function npcState(): SimulationRuntimeState {
  return {
    ...structuredClone(EMPTY_SIMULATION_STATE),
    entities: {
      'npc:gatekeeper': {
        entityKey: 'npc:gatekeeper',
        kind: 'npc',
        sourceId: 7,
        name: '守门人',
        locationKey: 'location:gate',
        lifecycleStatus: 'active',
        attributes: { mood: '平静' },
      },
      'location:gate': {
        entityKey: 'location:gate',
        kind: 'location',
        sourceId: 8,
        name: '城门',
        locationKey: null,
        lifecycleStatus: 'active',
        attributes: {},
      },
    },
    lastSequence: 3,
  }
}

function ttrpgState(): SimulationRuntimeState {
  return {
    ...structuredClone(EMPTY_SIMULATION_STATE),
    entities: {
      'character:linzhou': {
        entityKey: 'character:linzhou',
        kind: 'character',
        sourceId: 1,
        name: '林舟',
        locationKey: null,
        lifecycleStatus: 'active',
        attributes: {},
      },
      'npc:watcher': {
        entityKey: 'npc:watcher',
        kind: 'npc',
        sourceId: null,
        name: '守望者',
        locationKey: null,
        lifecycleStatus: 'active',
        attributes: {},
      },
    },
    ttrpg: {
      scene: { sceneId: 'scene:1', title: '门厅', description: '', locationKey: null, status: 'active' },
      round: 1,
      activeActorKey: 'character:linzhou',
      turnOrder: ['character:linzhou', 'npc:watcher'],
      actions: [],
      checks: [],
      attacks: [],
      encounter: null,
    },
    lastSequence: 3,
  }
}

/** 提取面板源码中某 category 的 AI 调用元信息对象字面量片段。 */
function metaForCategory(source: string, category: string): string {
  const marker = `category: '${category}'`
  const index = source.indexOf(marker)
  expect(index, `callsite for ${category} must exist`).toBeGreaterThan(-1)
  const close = source.indexOf('})', index)
  expect(close).toBeGreaterThan(index)
  return source.slice(index, close)
}

function builderArgsFor(source: string, builder: string): string {
  const marker = `${builder}({`
  const index = source.indexOf(marker)
  expect(index, `callsite for ${builder} must exist`).toBeGreaterThan(-1)
  const close = source.indexOf('})', index)
  expect(close).toBeGreaterThan(index)
  return source.slice(index, close)
}

describe('R-I18N-P2 · 模拟严格 JSON 调用的语言契约', () => {
  const panelSource = readFileSync(
    resolve(process.cwd(), 'src/components/simulation/SimulationRuntimePanel.tsx'),
    'utf8',
  )

  it('三个严格 JSON 调用点都显式声明 outputKind: language-neutral', () => {
    const categories = [
      'simulation.npc-evolution',
      'simulation.ttrpg-gm',
      'simulation.ttrpg-encounter',
    ]
    for (const category of categories) {
      const meta = metaForCategory(panelSource, category)
      expect(meta, `${category} meta must declare language-neutral outputKind`).toContain("outputKind: 'language-neutral'")
      expect(meta, `${category} meta must reject context overflow trimming`).toContain("contextOverflowPolicy: 'reject'")
    }
  })

  it('语言契约只经既有 contentLanguage resolver 解析，并传入三个提示词构造器', () => {
    expect(panelSource).toContain('resolveProjectContentLanguage(')
    expect(panelSource).toContain('getSupportedUiLang()')
    for (const builder of ['buildNpcEvolutionPrompt', 'buildTtrpgGmPrompt', 'buildTtrpgEncounterPrompt']) {
      expect(builderArgsFor(panelSource, builder), `${builder} must receive contentLanguage`).toContain('contentLanguage:')
    }
  })

  it('字段级分类事实源覆盖全部面向作者的自由文本字段（Oracle 修正）', () => {
    // NPC：narrative / memory.content / rationale + attributes 字符串值澄清行
    expect(NPC_EVOLUTION_NARRATIVE_FIELDS).toEqual(['narrative', 'memory.content', 'rationale'])
    expect(NPC_EVOLUTION_ATTRIBUTE_LANGUAGE_CLARIFICATION).toContain('mood')
    expect(NPC_EVOLUTION_ATTRIBUTE_LANGUAGE_CLARIFICATION).toContain('goal')
    expect(NPC_EVOLUTION_ATTRIBUTE_LANGUAGE_CLARIFICATION).toContain('condition')
    expect(NPC_EVOLUTION_ATTRIBUTE_LANGUAGE_CLARIFICATION).toContain('保持原样')
    // GM：check.skill 是 runtime 接受的自由散文，必须在语言契约内
    expect(TTRPG_GM_NARRATIVE_FIELDS).toEqual([
      'narrative', 'check.skill', 'check.reason', 'outcomes.success', 'outcomes.failure',
    ])
    expect(TTRPG_ENCOUNTER_NARRATIVE_FIELDS).toEqual(['title', 'description'])
  })

  it('指令构造器支持澄清行，且契约块结构不变', () => {
    const directive = buildSimulationNarrativeLanguageDirective('en', ['narrative'], ['澄清行。'])
    const lines = directive.split('\n')
    expect(lines[0]).toBe(DIRECTIVE_HEADER)
    expect(lines[1]).toContain('English')
    expect(lines[1]).toContain('narrative')
    expect(lines[2]).toBe('澄清行。')
    expect(lines[3]).toContain('必须保持原样')
    expect(lines[4]).toContain('不要新增字段')
  })

  it('pt-BR/en/zh-CN 指令按分类注入全部叙事字段，仍排除协议键/枚举/实体键/数值', () => {
    const npcBase = {
      authorRequest: '让他警惕起来',
      targetEntityKey: 'npc:gatekeeper',
      targetName: '守门人',
      runtimeContext: '冻结上下文',
    }
    const gmBase = { actorKey: 'character:linzhou', actorName: '林舟', action: '观察石门。', runtimeContext: '冻结上下文' }
    const encounterBase = { runtimeContext: '冻结上下文', participantKeys: ['character:linzhou', 'npc:watcher'] }
    const narrativeFieldsByKind: Record<string, readonly string[]> = {
      npc: NPC_EVOLUTION_NARRATIVE_FIELDS,
      gm: TTRPG_GM_NARRATIVE_FIELDS,
      encounter: TTRPG_ENCOUNTER_NARRATIVE_FIELDS,
    }
    // 真正不得出现在叙事契约里的协议标识符（数值表达式、枚举、实体键、协议形状）
    const forbiddenByKind: Record<string, readonly string[]> = {
      npc: ['entityKey', 'locationKey', 'lifecycleStatus', 'memory.status'],
      gm: ['actorKey', 'nextActorKey', 'check.expression', 'check.dc'],
      encounter: ['participantKeys'],
    }
    for (const lang of LANGS) {
      const systemContentByKind: Record<string, string> = {
        npc: buildNpcEvolutionPrompt({ ...npcBase, contentLanguage: lang })[0].content,
        gm: buildTtrpgGmPrompt({ ...gmBase, contentLanguage: lang })[0].content,
        encounter: buildTtrpgEncounterPrompt({ ...encounterBase, contentLanguage: lang })[0].content,
      }
      for (const [kind, systemContent] of Object.entries(systemContentByKind)) {
        const headerIndex = systemContent.indexOf(DIRECTIVE_HEADER)
        expect(headerIndex, `${kind}/${lang} directive must exist`).toBeGreaterThan(-1)
        const directive = systemContent.slice(headerIndex)
        expect(directive).toContain(LANGUAGE_NAMES[lang])
        for (const field of narrativeFieldsByKind[kind]) {
          expect(directive, `${kind}/${lang} directive must cover narrative field ${field}`).toContain(field)
        }
        for (const key of forbiddenByKind[kind]) {
          expect(directive, `${kind}/${lang} directive must not name protocol identifier ${key}`).not.toContain(key)
        }
        expect(directive).toContain('必须保持原样')
        expect(directive).toContain('不要新增字段')
      }
      // NPC attributes 自由文本值经澄清行覆盖；键名与非字符串值不受影响
      expect(systemContentByKind.npc).toContain(NPC_EVOLUTION_ATTRIBUTE_LANGUAGE_CLARIFICATION)
    }
  })

  it('三个提示词在给定内容语言时注入指令，缺省时保持原样不注入', () => {
    const npcBase = {
      authorRequest: '让他警惕起来',
      targetEntityKey: 'npc:gatekeeper',
      targetName: '守门人',
      runtimeContext: '冻结上下文',
    }
    const gmBase = { actorKey: 'character:linzhou', actorName: '林舟', action: '观察石门。', runtimeContext: '冻结上下文' }
    const encounterBase = { runtimeContext: '冻结上下文', participantKeys: ['character:linzhou', 'npc:watcher'] }
    for (const lang of LANGS) {
      for (const prompt of [
        buildNpcEvolutionPrompt({ ...npcBase, contentLanguage: lang }),
        buildTtrpgGmPrompt({ ...gmBase, contentLanguage: lang }),
        buildTtrpgEncounterPrompt({ ...encounterBase, contentLanguage: lang }),
      ]) {
        expect(prompt[0].content).toContain(DIRECTIVE_HEADER)
        expect(prompt[0].content).toContain(LANGUAGE_NAMES[lang])
      }
    }
    expect(buildNpcEvolutionPrompt(npcBase)[0].content).not.toContain(DIRECTIVE_HEADER)
    expect(buildTtrpgGmPrompt(gmBase)[0].content).not.toContain(DIRECTIVE_HEADER)
    expect(buildTtrpgEncounterPrompt(encounterBase)[0].content).not.toContain(DIRECTIVE_HEADER)
  })

  it('解析后 JSON 键、canonical 枚举与实体键保持原样，不做解析后翻译', () => {
    const candidate = parseNpcEvolutionCandidate({
      draft: JSON.stringify({
        entityKey: 'npc:gatekeeper',
        locationKey: 'location:gate',
        lifecycleStatus: 'active',
        attributes: { mood: 'wary' },
        narrative: 'The gatekeeper heard the alarm and left the gate.',
        memory: { status: 'known', content: 'He memorized the market signal.' },
        rationale: 'Retreat after the clash, as requested.',
      }),
      state: npcState(),
      targetEntityKey: 'npc:gatekeeper',
      baseSequence: 3,
    })
    expect(candidate.entityKey).toBe('npc:gatekeeper')
    expect(candidate.locationKey).toBe('location:gate')
    expect(candidate.lifecycleStatus).toBe('active')
    expect(candidate.memory?.status).toBe('known')
    expect(candidate.narrative).toBe('The gatekeeper heard the alarm and left the gate.')

    const turn = parseTtrpgTurnCandidate({
      draft: JSON.stringify({
        actorKey: 'character:linzhou',
        narrative: 'Lin Zhou reaches for the mechanism.',
        check: { skill: 'Investigation', expression: '1d20+3', dc: 14, reason: 'Inspect the mechanism.' },
        outcomes: { success: 'Disarmed safely.', failure: 'An alarm sounds.' },
        nextActorKey: 'npc:watcher',
      }),
      state: ttrpgState(),
      actorKey: 'character:linzhou',
      action: 'Try to disarm it.',
      baseSequence: 3,
    })
    expect(turn.actorKey).toBe('character:linzhou')
    expect(turn.nextActorKey).toBe('npc:watcher')
    expect(turn.check).toMatchObject({ skill: 'Investigation', expression: '1d20+3', dc: 14 })
  })

  it('严格 JSON 与 JSON5 恢复都保持实体键与表达式字节级不变', () => {
    const strict = parseNpcEvolutionCandidate({
      draft: JSON.stringify({
        entityKey: 'npc:gatekeeper',
        locationKey: 'location:gate',
        lifecycleStatus: 'active',
        attributes: { mood: '警惕' },
        narrative: '守门人握紧了长矛。',
        memory: null,
        rationale: '',
      }),
      state: npcState(),
      targetEntityKey: 'npc:gatekeeper',
      baseSequence: 3,
    })
    expect(strict.entityKey).toBe('npc:gatekeeper')

    const json5 = parseNpcEvolutionCandidate({
      draft: `{
        entityKey: 'npc:gatekeeper',
        locationKey: 'location:gate',
        lifecycleStatus: 'active',
        attributes: { mood: '警惕', },
        narrative: '守门人握紧了长矛。',
        memory: null,
        rationale: '',
      }`,
      state: npcState(),
      targetEntityKey: 'npc:gatekeeper',
      baseSequence: 3,
    })
    expect(json5.entityKey).toBe('npc:gatekeeper')
    expect(json5.lifecycleStatus).toBe('active')
    expect(json5.attributes).toMatchObject({ mood: '警惕' })

    const fenced = parseTtrpgTurnCandidate({
      draft: '```json\n' + JSON.stringify({
        actorKey: 'character:linzhou',
        narrative: '观察。',
        check: { skill: '感知', expression: '1d20', dc: 10, reason: '查看暗处。' },
        outcomes: { success: '看清了。', failure: '一无所获。' },
        nextActorKey: null,
      }) + '\n```',
      state: ttrpgState(),
      actorKey: 'character:linzhou',
      action: '观察。',
      baseSequence: 3,
    })
    expect(fenced.check).toMatchObject({ skill: '感知', expression: '1d20', dc: 10 })
  })

  it('JSON5 恢复后仍拒绝无效 NPC 生命周期枚举与伪造实体键', () => {
    const base = {
      state: npcState(),
      targetEntityKey: 'npc:gatekeeper',
      baseSequence: 3,
    }
    expect(() => parseNpcEvolutionCandidate({
      ...base,
      draft: `{
        entityKey: 'npc:gatekeeper',
        locationKey: 'location:gate',
        lifecycleStatus: 'zombie',
        attributes: {},
        narrative: '',
        memory: null,
        rationale: '',
      }`,
    })).toThrow(/zombie/)
    expect(() => parseNpcEvolutionCandidate({
      ...base,
      draft: `{
        entityKey: 'npc:gatekeeper',
        locationKey: 'location:forged',
        lifecycleStatus: 'active',
        attributes: {},
        narrative: '',
        memory: null,
        rationale: '',
      }`,
    })).toThrow(/location:forged/)
    expect(() => parseNpcEvolutionCandidate({
      ...base,
      draft: `{
        entityKey: 'npc:gatekeeper',
        locationKey: 'location:gate',
        lifecycleStatus: 'active',
        attributes: {},
        narrative: '',
        memory: { status: 'remembered', content: '越权状态。' },
        rationale: '',
      }`,
    })).toThrow(/remembered/)
  })

  it('JSON5 恢复后仍锁定 GM 行动者，并拒绝回合顺序外的下一行动者', () => {
    const base = {
      state: ttrpgState(),
      actorKey: 'character:linzhou',
      action: '观察。',
      baseSequence: 3,
    }
    expect(() => parseTtrpgTurnCandidate({
      ...base,
      draft: `{
        actorKey: 'npc:watcher',
        narrative: '越权。',
        check: null,
        outcomes: null,
        nextActorKey: null,
      }`,
    })).toThrow('不能改写')
    expect(() => parseTtrpgTurnCandidate({
      ...base,
      draft: `{
        actorKey: 'character:linzhou',
        narrative: '观察。',
        check: null,
        outcomes: null,
        nextActorKey: 'monster:new',
      }`,
    })).toThrow('回合顺序')
    expect(() => parseTtrpgTurnCandidate({
      ...base,
      draft: `{
        actorKey: 'character:linzhou',
        narrative: '观察。',
        check: null,
        outcomes: null,
        nextActorKey: null,
        hp: 99,
      }`,
    })).toThrow('未知字段')
  })

  it('JSON5 恢复后仍拒绝作者未指定的遭遇参与者', () => {
    expect(() => parseTtrpgEncounterCandidate({
      draft: `{
        title: '门厅伏击',
        description: '守望者拦住了通路。',
        participantKeys: ['character:linzhou', 'monster:new'],
      }`,
      state: ttrpgState(),
      participantKeys: ['character:linzhou', 'npc:watcher'],
      baseSequence: 3,
    })).toThrow('未指定')
    const recovered = parseTtrpgEncounterCandidate({
      draft: `{
        title: '门厅伏击',
        description: '守望者拦住了通路。',
        participantKeys: ['character:linzhou', 'npc:watcher',],
      }`,
      state: ttrpgState(),
      participantKeys: ['character:linzhou', 'npc:watcher'],
      baseSequence: 3,
    })
    expect(recovered.participantKeys).toEqual(['character:linzhou', 'npc:watcher'])
  })
})
