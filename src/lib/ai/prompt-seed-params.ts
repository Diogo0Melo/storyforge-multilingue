import type { PromptParameter } from '../types/prompt'

export const VOLUME_OUTLINE_PARAMETERS: PromptParameter[] = [
  {
    key: 'pace',
    label: '整体节奏',
    labelKey: 'promptParams.pace.label',
    type: 'select',
    options: ['慢', '中', '快', '极快'],
    optionLabelKeys: [
      'promptParams.pace.options.slow',
      'promptParams.pace.options.medium',
      'promptParams.pace.options.fast',
      'promptParams.pace.options.veryFast',
    ],
    default: '中',
    description: '影响每卷信息密度',
    descriptionKey: 'promptParams.pace.description',
    optional: true,
  },
  {
    key: 'volumeCount',
    label: '建议卷数',
    labelKey: 'promptParams.volumeCount.label',
    type: 'slider',
    min: 1,
    max: 30,
    step: 1,
    default: 5,
    description: '不指定则按目标字数自动估算',
    descriptionKey: 'promptParams.volumeCount.description',
    optional: true,
  },
]
