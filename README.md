# pi-skill-palette

Namespace-aware skill palette for [pi](https://github.com/badlogic/pi). Groups skills by category folder (marketing, infra, comms, etc.) for faster discovery.

```
/skill
```

## How it works

Skills are auto-grouped by their category folder. The namespace is derived from:

1. **Symlink targets** — `~/.pi/agent/skills/ad-creative -> .../marketing/ad-creative` → namespace `marketing`
2. **Directory hierarchy** — `.pi/skills/marketing/ad-creative/SKILL.md` → namespace `marketing`
3. **Fallback** — skills without a parent category go to `other`

No changes to SKILL.md files needed. Fully compatible with the [Agent Skills spec](https://agentskills.io/specification).

## Filtering

| Input | Behavior |
|-------|----------|
| `marketing` | Shows all skills in the `marketing` namespace |
| `marketing:ad` | Fuzzy-matches within the `marketing` namespace |
| `prod` | Prefix match → shows all `productivity` skills |
| `slack` | Fuzzy-matches skill name across all namespaces |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate (skips headers) |
| `Enter` | Select skill / Unqueue if already queued |
| `Esc` | Cancel |
| Type | Fuzzy filter |

## Skill Injection

Selected skills are queued and injected alongside your next message via `before_agent_start`. A widget and status indicator show the queued skill until consumed.

## Direct Selection

Skip the palette with direct arguments:

```
/skill marketing:ad-creative
/skill brave-search
```

## Install

```bash
# From repo
pi install git:github.com/kaiserlich-dev/pi-skill-palette

# Or link locally for development
pi -e ./extensions/skill-palette.ts
```

## Skill Locations

Skills are scanned from (in order):

1. `~/.codex/skills/` (recursive)
2. `~/.claude/skills/` (one level)
3. `.claude/skills/` (one level)
4. `~/.pi/agent/skills/` (recursive)
5. `~/.pi/skills/` (recursive)
6. `.pi/skills/` (recursive)
