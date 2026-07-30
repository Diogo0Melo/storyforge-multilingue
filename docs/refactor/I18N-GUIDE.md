# i18n 架构指南

> 项目已从自研零依赖 i18n 迁移到 **react-i18next** 体系。本文档是当前架构的唯一参考。

---

## 架构概览

| 层 | 依赖 | 职责 |
|---|---|---|
| 核心 | `i18next` | 翻译引擎、命名空间管理、回退链 |
| React 绑定 | `react-i18next` | `useTranslation` hook、`<Trans>` 组件、Suspense 集成 |
| 资源加载 | `i18next-http-backend` | 按需 HTTP 拉取 `public/locales/{lng}/{ns}.json` |
| 语言检测 | `i18next-browser-languagedetector` | localStorage → navigator 自动检测 |
| 类型生成 | `scripts/generate-i18n-types.mjs` | 从 JSON 生成扁平 key 联合类型，避免 TS2589 |

初始化入口：`src/i18n/i18n.ts`（在 `main.tsx` 渲染前 import 一次）。
配置常量：`src/i18n/settings.ts`（单一事实源）。

---

## 语言与回退

| 语言代码 | 角色 | 显示名 |
|---|---|---|
| `zh-CN` | 默认 + 回退语言 | 中文 |
| `pt-BR` | 第二语言 | Português (BR) |

- `fallbackLng: 'zh-CN'` — 任何缺失 key 回退到中文。
- 检测顺序：`localStorage['i18nextLng']` → `navigator.language`。
- 持久化 key：`i18nextLng`（由 `settings.ts` 的 `STORAGE_KEY` 导出）。

---

## 命名空间（10 个）

```ts
// src/i18n/settings.ts
export const NAMESPACES = [
  'common',     // 通用按钮、状态、高频文案（默认 NS）
  'nav',        // 侧栏导航
  'project',    // 项目管理
  'editor',     // 编辑器
  'outline',    // 大纲
  'characters', // 角色
  'worlds',     // 世界
  'settings',   // 设置页
  'import',     // 导入
  'panels',     // 各创作面板（最大，1174+ keys）
] as const
```

`DEFAULT_NS = 'common'` — 不指定命名空间时默认使用。

---

## 文件结构

```
public/locales/
├── zh-CN/
│   ├── common.json
│   ├── nav.json
│   ├── project.json
│   ├── editor.json
│   ├── outline.json
│   ├── characters.json
│   ├── worlds.json
│   ├── settings.json
│   ├── import.json
│   └── panels.json
└── pt-BR/
    ├── common.json
    ├── ... (同上 10 个)
    └── panels.json
```

HTTP 加载路径：`/storyforge/locales/{{lng}}/{{ns}}.json`

---

## 添加新翻译 key 的流程

```
1. 在 public/locales/zh-CN/{ns}.json 添加中文 key
2. 在 public/locales/pt-BR/{ns}.json 添加对应葡语翻译
3. 运行 npm run i18n:types          ← 重新生成类型
4. 在代码中使用 t('key')
```

**不要跳过第 3 步**——`generated-resources.d.ts` 不会自动更新，新 key 在 TypeScript 中会报类型错误。

---

## 在 React 组件中使用

### 单命名空间（最常见）

```tsx
import { useTranslation } from 'react-i18next'

function Toolbar() {
  const { t } = useTranslation('editor')
  return <button>{t('generateChapter')}</button>
}
```

### 多命名空间

```tsx
const { t } = useTranslation(['editor', 'common'])

// 第一个 NS 是默认，可直接用 key
t('generateChapter')           // → editor.generateChapter

// 其他 NS 需要前缀
t('common:save')               // → common.save
```

### 不指定命名空间（使用默认 `common`）

```tsx
const { t } = useTranslation()
t('save')                      // → common.save
```

---

## 在非 React 文件中使用

store、service、util 等不依赖 React 的环境：

```ts
import i18n from '../i18n/i18n'

const label = i18n.t('common:save')
```

注意非 React 环境必须用 `ns:key` 格式（带命名空间前缀），因为没有 hook 提供默认 NS。

---

## 类型安全

`scripts/generate-i18n-types.mjs` 读取 `public/locales/zh-CN/*.json`，生成 `src/i18n/generated-resources.d.ts`：

- 每个命名空间生成一个扁平 key 联合类型（如 `CommonKeys = 'save' | 'cancel' | ...`）
- 汇总为 `FlatResources` 接口，注入 i18next 的 `CustomTypeOptions`

```
JSON: { "editor": { "generateChapter": "生成章节" } }
Type: EditorKeys = 'generateChapter' | ...
```

`src/i18n/i18next.d.ts` 声明：

```ts
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    returnNull: false
    resources: FlatResources
  }
}
```

**效果**：`t('editor.generateChapter')` 有完整自动补全和类型检查，**不需要 `as any`**。

---

## 语言切换组件

位置：`src/components/settings/LanguageSelector.tsx`

```tsx
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from '../../i18n/settings'

function LanguageSelector() {
  const { i18n } = useTranslation('settings')
  return (
    <>
      {SUPPORTED_LANGUAGES.map(lang => (
        <button
          key={lang}
          onClick={() => i18n.changeLanguage(lang)}
          aria-pressed={i18n.language === lang}
        >
          {LANGUAGE_LABELS[lang]}
        </button>
      ))}
    </>
  )
}
```

已集成在 `SettingsPage` 中。

---

## PWA / HTML lang 处理

`index.html` 内联脚本在 paint 前设置 `<html lang>`：

```html
<script>
  (function () {
    var lang = 'zh-CN';
    try {
      lang = localStorage.getItem('i18nextLng')
        || (navigator.language.startsWith('pt') ? 'pt-BR' : 'zh-CN');
    } catch (e) {}
    document.documentElement.lang = lang;
  })();
</script>
```

- 避免闪烁：在 React 挂载前就设好 `lang` 属性。
- i18next 运行时修改语言会同步更新 `localStorage['i18nextLng']`，下次刷新生效。

---

## 约定

| 规则 | 说明 |
|---|---|
| 直角引号 `「」` | JSON 值中的引用使用直角引号，不使用 `""` 或 `''` |
| AI 提示词保持中文 | 发给 AI 的 prompt 模板不翻译，始终用中文 |
| 代码注释保持中文 | 项目注释语言为中文 |
| key 命名 | camelCase，按语义命名（如 `generateChapter`、`deleteConfirm`） |
| 新增 key 必须同步双语 | zh-CN 和 pt-BR 都要添加，缺失的 key 运行时回退中文 |

---

## 开发调试

开发模式下 `saveMissing: true`，控制台会输出缺失的 key：

```
[i18n] Missing: pt-BR/editor/generateChapter
```

用于快速发现未翻译的条目。
