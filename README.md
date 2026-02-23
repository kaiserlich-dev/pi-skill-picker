# @kaiserlich-dev/pi-skill-picker

Namespace-aware skill palette for [pi](https://github.com/mariozechner/pi). Groups skills by category folder (marketing, infra, comms, etc.) for faster discovery.

## Install

### npm (recommended)

```bash
pi install npm:@kaiserlich-dev/pi-skill-picker
```

### git (alternative)

```bash
pi install git:github.com/kaiserlich-dev/pi-skill-picker
```

> By default this writes to `~/.pi/agent/settings.json`. Use `-l` to install into `.pi/settings.json` for a project.

Then restart pi or run `/reload`.

## Usage

**`Alt+K`** — open the skill palette instantly.

Or use the `/skill` command:

```
/skill                          # opens palette
/skill marketing:ad-creative    # queue directly
/skill brave-search             # queue by name
```

## Features

### Namespace grouping

Skills are auto-grouped by their category folder. The namespace is derived from:

1. **Symlink targets** — `~/.pi/agent/skills/ad-creative -> .../marketing/ad-creative` → namespace `marketing`
2. **Directory hierarchy** — `.pi/skills/marketing/ad-creative/SKILL.md` → namespace `marketing`
3. **Fallback** — skills without a parent category go to `other`

No changes to SKILL.md files needed. Fully compatible with the [Agent Skills spec](https://agentskills.io/specification).

### Smart search

When you type, results are shown as a flat list sorted by relevance — no namespace grouping to bury high-scoring results.

| Input | Behavior |
|-------|----------|
| `marketing` | Shows all skills in the `marketing` namespace |
| `marketing:ad` | Matches within the `marketing` namespace |
| `prod` | Prefix match → shows all `productivity` skills |
| `supabase` | Finds supabase-ro, supabase-vectors by name |
| `ad` | ad-creative first (starts-with beats substring) |

Scoring: exact match > starts-with > substring (boundary-aware) > fuzzy. Description matches are substring-only to avoid garbage results.

### Recently used skills

Your most-used skills appear in a **★ recent** section at the top of the palette, pre-selected. Usage count is shown for skills used more than once (`×3`).

Persisted to `~/.pi-skill-picker/usage.json` — survives across sessions.

### Skill injection

Selected skills are queued and injected alongside your next message via `before_agent_start`. A widget and status indicator show the queued skill until consumed.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Alt+K` | Open palette from anywhere |
| `↑` / `↓` | Navigate (skips headers) |
| `Enter` | Select skill / Unqueue if already queued |
| `Esc` | Cancel |
| Type | Filter |

## Development

```bash
# Run locally without installing
pi -e ./extensions/skill-palette.ts
```
