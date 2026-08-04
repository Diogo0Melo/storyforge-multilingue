🌐 **README:** [Português (BR)](./README.md) · **English** · [中文](./README.zh-CN.md)

> Personal fork of [yuanbw2025/storyforge](https://github.com/yuanbw2025/storyforge), maintained for personal use; the only addition over upstream is the internationalization layer (pt-BR / zh-CN).

---

# StoryForge

> AI-assisted novel-writing workbench. Pure frontend, local-first, fully transparent prompts — giving authors control over the entire creative pipeline from inspiration, worldbuilding, and outlining to drafting, reviewing, and exporting.

**Community & Tutorials**

- GitHub: https://github.com/yuanbw2025/storyforge
- Original author's homepage: https://yuanbw.vercel.app/
- Original author's Zhihu profile: https://www.zhihu.com/people/dan-ran-xing-yuan-59
- Zhihu column article: https://zhuanlan.zhihu.com/p/2038714210188780594
- Bilibili project video guide: https://www.bilibili.com/video/BV1q37j6QExh/
- QQ discussion group: 1082374587

---

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-5-brown)
![Dexie](https://img.shields.io/badge/Dexie.js-IndexedDB-orange)
![TipTap](https://img.shields.io/badge/TipTap-Editor-purple)
![PWA](https://img.shields.io/badge/PWA-Offline-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## TL;DR

**StoryForge** is a local-first, browser-based AI writing studio for long-form fiction.

- **Local-first by default**: manuscript data lives in the browser's IndexedDB. AI calls, cloud backup, or custom proxy/base URLs send only the relevant content to the third-party service configured by the user.
- **Bring your own AI**: supports many OpenAI-compatible providers, Anthropic Claude, Gemini, local models, and custom endpoints.
- **No black box**: prompts are visible, editable, cloneable, parameterized, and reusable.
- **Built for long stories**: multiworld settings, story arcs, foreshadowing, state cards, item ledger, temporal facts, retrieval memory, chapter review, style learning, and export/backup workflows.

```bash
npm install
npm run dev      # http://localhost:1111/storyforge/
npm run ci       # schema checks + AI manual check + architecture check + typecheck + coverage + build
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before contributing.

---

## Table of Contents

- [Project Positioning](#project-positioning)
- [Core Capabilities](#core-capabilities)
- [Feature Overview](#feature-overview)
- [AI & Prompt System](#ai-prompt-system)
- [Data & Security Boundaries](#data-security-boundaries)
- [Technical Architecture](#technical-architecture)
- [Quick Start](#quick-start)
- [Development & Validation](#development-validation)
- [Who It's For](#who-its-for)
- [Documentation Index](#documentation-index)
- [License](#license)
- [Star History](#star-history)

---

## Project Positioning

StoryForge is not a "one-click complete novel" black-box tool — it is an AI creative workshop for authors:

| Goal | How StoryForge does it |
|---|---|
| Author stays in control | All AI output is previewed, edited, and adopted; AI assists but never finalizes on behalf of the author |
| Prompts are visible and editable | Every AI feature exposes its System Prompt, User Template, parameters, and examples for inspection and cloning |
| Long-form settings stay organized | Worldbuilding, characters, outlines, foreshadowing, state, items, facts, and storylines all live in a structured local database |
| References feed back into writing | Project references, historical research, style learning, and scene verification can enter subsequent AI context |
| Data is local-first | No StoryForge backend by default; project data lives in the user's browser IndexedDB |

---

## Core Capabilities

### From Inspiration to Project

- Home page manages all novel projects, with support for creating, deleting, and restoring from local folders.
- Project overview maintains name, synopsis, genre, target word count, writing status, and multi-world toggle.
- Inspiration reverse-engineering turns short premises, fragments, and ideas into adoptable structures for story core, worldbuilding, characters, and outlines.
- Project references support story references, style references, historical materials, and multi-dimensional analysis of uploaded content.

### Setting Library

- Multi-world overview: manage world groups, world relationships, primary world, and cross-world structures.
- Real vs. Fictional: declare per dimension which content is grounded in reality and which allows fictional adaptation — usable for both historical research and fictional worldbuilding.
- Worldbuilding: world origins, natural environment, cultural environment, historical timeline, world map.
- Story design: one-sentence story, story concept, themes, core conflict, story mode, main plot, subplots.
- Character design: character generation, main characters, secondary characters, NPCs, extras, relationship network.

### Creative Workspace

- Writing rules: writing style, narrative perspective, tone, taboos, consistency rules, and reference-work injection.
- Outline: volume/chapter tree, AI-generated volume outlines, chapter expansion, chapter preview.
- Character-driven: derive plot progression from character motivations, relationships, and arcs.
- Storylines: main plot / subplots, stage cards, progress tracking, and AI generation.
- Chapters: chapter list, TipTap prose editor, auto-save, continuation, polishing, expansion, de-AI-ification, review, sticky notes.
- Foreshadowing: foreshadowing type, planted / echoed / resolved status, urgency, kanban board, and AI suggestions.
- Style learning: extract a profile from written chapters and author-approved before/after short samples, then continuously feed back into subsequent generation through interactive calibration.
- Key locations: location tree, tags, hierarchy, and location data.
- State tables: state cards and event timelines for characters, locations, items, factions, etc.
- Item ledger: track item acquisition, possession, transfer, and consumption.
- Fact library: temporal-fact candidates extracted from chapter prose, confirmed or vetoed for long-term consistency.
- Story timeline: global events recorded per chapter and plot time.
- Scene verification: cross-check specific scene details against worldbuilding, historical timeline, and rules.

### Prompt Library & Workflows

- Template management: system templates, user templates, parameters, positive/negative examples, live preview.
- Genre packs: historical, xianxia, romance, realism, mystery/suspense — hot-swappable styles.
- PromptRunPanel: runtime parameter tuning, temporary prompt edits, streaming output, adoption, marking good/bad examples.
- Workflows: chain multiple AI steps together, supporting automatic orchestration and write-back from story core to worldbuilding, characters, outlines, and chapters.

### Import, Export & Backup

- Document parsing: upload or paste text, parsed in chunks into current project settings or project references.
- Large-document pipeline: Blob persistence, resumable checkpoints, pause/cancel, log tracking, character deduplication and merging.
- Data management: full JSON backup, Markdown/TXT/HTML export, local-folder auto-backup, GitHub Gist cloud backup.
- Version history: automatic and manual snapshots; restoration creates a new project to avoid overwriting the current manuscript.
- Usage statistics: per-project or global view of AI call counts, tokens, and estimated cost.

---

## Feature Overview

The current sidebar is composed of 5 top-level modules:

| Top-level module | Secondary entries |
|---|---|
| Book Info | Project Overview, Inspiration Reverse-Engineering, Project References |
| Setting Library | World Overview, Real vs. Fictional, World Origins, Natural Environment, Cultural Environment, Historical Timeline, World Map, Story Design, Character Generation, Main Characters, Secondary Characters, NPCs, Extras, Relationship Network |
| Creative Workspace | Writing Rules, Outline, Character-Driven, Storylines, Chapters, Foreshadowing, Style Learning, Key Locations, State Tables, Item Ledger, Fact Library, Story Timeline, Scene Verification |
| Prompt Library | Templates, Genre Packs, Parameters, Positive/Negative Examples, Workflows |
| Settings | Version History, Document Parsing, Data Management, Usage Statistics, Settings |

For a more detailed illustrated user guide, see [docs/FEATURE-GUIDE.md](./docs/FEATURE-GUIDE.md). That document expands each page and secondary tab with screenshots.

---

## AI & Prompt System

StoryForge's AI capabilities are organized into three layers:

1. **Context assembly**: reads project overview, worldbuilding, characters, outline, foreshadowing, state, facts, references, and more based on the current task.
2. **Prompt rendering**: uses template variables, conditional blocks, parameter toggles, and few-shot examples to produce the final prompt.
3. **Structured adoption**: AI output never becomes fact directly — it is written into fields, collections, or chapter prose only after user confirmation.

### Supported AI Providers

Built-in providers on the Settings page include:

| Category | Provider |
|---|---|
| International / Aggregators | OpenAI, Anthropic Claude, Google Gemini, Poe, NVIDIA NIM |
| Chinese cloud services | DeepSeek, Tongyi Qianwen, Doubao, Zhipu GLM, Wenxin Yiyan, Kimi, MiniMax, ModelScope, Agnes AI, LongCat, OpenCode Go |
| Local / Custom | Ollama, LM Studio, and other OpenAI-compatible local services; custom Base URL |

Services that are region-restricted or subject to browser CORS limitations can be forwarded through the local Vite proxy; any custom endpoint compatible with the OpenAI `chat/completions` API can be connected.

### Prompt Template Capabilities

```ts
renderPrompt(template, context, {
  parameterValues,
  overrides,
})
```

| Capability | Description |
|---|---|
| `{{var}}` | Template variable substitution |
| `{{#if var}}...{{/if}}` | Conditional blocks |
| Parameter controls | select, slider, number, text, boolean |
| Positive/negative examples | Good and bad examples are automatically appended to the prompt |
| Clone & edit | System templates can be cloned into user templates and freely modified |
| Workflow write-back | Multi-step generation results can be automatically written back to story, characters, outline, foreshadowing, and other targets |

---

## Data & Security Boundaries

StoryForge is a pure-frontend project with no self-hosted application backend.

| Data / Action | Destination |
|---|---|
| Project data | Saved to browser IndexedDB by default |
| AI API Key | sessionStorage by default; written to localStorage only when the user explicitly chooses "remember on this device" |
| GitHub PAT | sessionStorage by default; written to localStorage only when the user explicitly chooses "remember on this device" |
| AI generation | Sends relevant context to the user-configured AI service |
| Gist cloud backup | Uploads the full project JSON to the user's own private GitHub Gist |
| Local-folder backup | Writes to a user-authorized local directory via the browser File System Access API |

In production, if missing tables are detected in the IndexedDB schema the database is never automatically dropped; automatic reset is allowed only in development. On startup, the app requests persistent browser storage to reduce the risk of IndexedDB being evicted by the browser.

---

## Technical Architecture

### Six-Layer Architecture from Storage to User Value

StoryForge is divided into six layers oriented from "foundational capabilities supporting user value upward." The UI expresses only user intent and confirmation; AI reads, AI writes, and table lifecycles are each funneled into their own registry — panels are not allowed to form parallel pipelines.

[![StoryForge Six-Layer Architecture from Storage to User Value](./docs/assets/architecture/storyforge-architecture-overview.png)](./docs/assets/architecture/storyforge-architecture-overview.png)

The diagram also shows the code mapping of `PROJECT_TABLES`, the unified AI read/write main paths, and the domain distribution of 42 tables. See the implementation in [`src/lib/registry`](./src/lib/registry), [`src/lib/db/schema.ts`](./src/lib/db/schema.ts), and [`scripts/check-architecture.mjs`](./scripts/check-architecture.mjs).

### Three Registries

Project extensions must converge into three single sources of truth:

| Registry | Responsibility |
|---|---|
| `CONTEXT_SOURCES` | What the AI reads and how context is assembled |
| `FIELD_REGISTRY` + `ADOPTION_SCHEMAS` | What the AI writes and how adoption is validated and deduplicated |
| `PROJECT_TABLES` | Table lifecycle — how export / import / delete / migration are covered |

See [CLAUDE.md](./CLAUDE.md) and [docs/MASTER-BLUEPRINT.md](./docs/MASTER-BLUEPRINT.md) for details.

---

## Quick Start

### macOS / Linux / Windows (General)

```bash
git clone https://github.com/yuanbw2025/storyforge.git
cd storyforge
npm install
npm run dev
```

Open:

```text
http://localhost:1111/storyforge/
```

### Windows Users Starting from Scratch

StoryForge no longer ships `.bat`, `.exe`, or Windows Portable launchers. Windows users should download the source ZIP and start via npm:

1. Go to GitHub Releases and download `Source code (zip)`.
2. Extract and enter the directory containing `package.json`.
3. Install Node.js LTS: https://nodejs.org/
4. Open PowerShell in the project directory.
5. Run `npm install` then `npm run dev`.
6. Open `http://localhost:1111/storyforge/` in your browser.

For detailed illustrated steps, see [使用npm指令启动项目.md](./使用npm指令启动项目.md).

---

## Development & Validation

Common commands:

```bash
npm run dev
npm run build
npm run test
npm run test:coverage
npm run check:required-tables
npm run check:ai-manual
npm run check:architecture
npm run ci
```

Before committing, it is recommended to run at least:

```bash
npm run ci
```

If only documentation was changed, lighter validation scoped to the changes may be used; changes touching data tables, AI reads/writes, export/import, deletion, or migration must run the full validation and follow the three-registry rules in [CLAUDE.md](./CLAUDE.md).

---

## Who It's For

| Good fit | Not a good fit |
|---|---|
| Novel authors who want control over prompts and AI output | People who just want to generate a complete novel in one click |
| Long-form, serial, multi-world, and ensemble-cast creators | People unwilling to maintain settings and outlines |
| People who want to build personal genre packs, style templates, and workflows | People who need real-time multi-user collaboration and cloud-based team permissions |
| People who want to bring research, references, and source material into their writing workflow | People who want all data hosted on an official backend |
| People who want local-first, swappable models, and customizable endpoints | People who don't want to configure any AI key or local model |

---

## Documentation Index

| Document | Purpose |
|---|---|
| [docs/FEATURE-GUIDE.md](./docs/FEATURE-GUIDE.md) | Complete user-facing feature manual |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Contribution guide |
| [CHANGELOG.md](./CHANGELOG.md) | Version change log |
| [CLAUDE.md](./CLAUDE.md) | Rules that AI / developers taking over the project must follow |
| [docs/MASTER-BLUEPRINT.md](./docs/MASTER-BLUEPRINT.md) | Refactoring blueprint and architectural authority |
| [docs/roadmap/README.md](./docs/roadmap/README.md) | Current feature systems, backlog groupings, and build order |
| [docs/roadmap/CAPABILITY-BASELINE.md](./docs/roadmap/CAPABILITY-BASELINE.md) | Existing capabilities and no-rebuild boundaries |
| [docs/roadmap/COMPLETED.md](./docs/roadmap/COMPLETED.md) | Completed development units and historical evidence entry |
| [docs/AI-FUNCTIONS-MANUAL.generated.md](./docs/AI-FUNCTIONS-MANUAL.generated.md) | Code-generated AI feature inventory |
| [SECURITY.md](./SECURITY.md) | Vulnerability reporting, response process, and supported-version policy |

---

## License

StoryForge is open-sourced under the [MIT License](./LICENSE). You are free to use, copy, modify, distribute, and commercially exploit this project's code; please retain the original copyright and license notices.

---

## Star History

[![StoryForge Star History](./docs/assets/architecture/storyforge-star-history.svg)](https://star-history.com/#yuanbw2025/storyforge&Date)

The line chart is generated from GitHub's official stargazer timestamp data; update command: `node scripts/generate-star-history.mjs`.

---

## Feature Overview Guide

The complete illustrated feature manual is at [docs/FEATURE-GUIDE.md](./docs/FEATURE-GUIDE.md). The document expands each page and secondary tab with feature descriptions, project-logic explanations, and accompanying screenshots.
