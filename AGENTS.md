# Pi Skill Picker

## Published npm package

This is a published npm package: `@kaiserlich-dev/pi-skill-picker`

**When you add features, fix bugs, or change behavior:**
1. Update `README.md` to reflect the change
2. Bump version in `package.json` (`npm version patch|minor|major --no-git-tag-version`)
3. After pushing, publish with `npm run publish:pi`

Use **patch** for bug fixes, **minor** for new features, **major** for breaking changes.

## Testing

- `npx tsc --noEmit` — must pass before every commit
- `node --import tsx extensions/__tests__/fuzzy.test.ts` — fuzzy matching and filtering
- `node --import tsx extensions/__tests__/skill-loader.test.ts` — frontmatter parsing, namespace resolution
- `node --import tsx extensions/__tests__/palette.test.ts` — palette input handling

## Architecture

Screen module pattern (from pi-subagents):
- `screens/palette.ts` — State, handleInput() → Action, render()
- `lib/render-helpers.ts` — theme-aware box drawing
- `skill-loader.ts` — filesystem scanning, frontmatter parsing
- `fuzzy.ts` — scoring and filtering (pure functions)
- `usage.ts` — disk-backed usage tracking
- `component.ts` — SkillPaletteComponent class
- `skill-palette.ts` — thin entry: lifecycle + commands only
- All rendering uses `theme.fg()` — no raw ANSI escapes
