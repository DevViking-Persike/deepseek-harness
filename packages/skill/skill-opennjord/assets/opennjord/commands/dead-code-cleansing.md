---
description: Find and remove unused code, exports, and dead code paths
allowed-tools: Bash(git status:*), Bash(git branch:*), Bash(git log:*), Bash(git diff:*), Bash(find), Bash(grep), Bash(npm run check), Bash(git add:*), Bash(git commit:*)
---

## Context

- Current git status: !`git status --porcelain`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -5`

## Your Task

Identify and remove unused code, types, exports, and dead code paths from the codebase.

### Prerequisites

- Ensure all changes are committed or stashed
- Create a new branch for cleanup work
- Verify TypeScript/Svelte compilation: `npm run check`

> Nota: este projeto não tem `unimported` nem ESLint configurados (`package.json`
> só define `check` via `svelte-check`). Identificação de arquivo não usado é
> manual, via `grep`/`find` (Fase 1 abaixo), não por ferramenta dedicada.

### To-Do List

#### Phase 1: Identify Unused Files

1. Listar candidatos a arquivo não usado manualmente:
   - `.ts`: `find src/lib -name '*.ts' -not -name '*.test.ts'`
   - `.svelte`: `find src -name '*.svelte'`
   - Para cada candidato, checar se há import em algum outro arquivo: `grep -rl "<nome-do-arquivo-sem-extensao>" src`
2. Document number of candidate unused files, unresolved imports
3. List all unimported file paths

#### Phase 2: Verify Unused Files

4. For each unimported file, verify it's truly unused:
   - Search for imports: `grep -r "filename" src --include="*.ts"`
   - Search for exports: `grep -r "ExportedName" src --include="*.ts"`
   - Check for dynamic imports
   - **CRITICAL for barrel files (index.ts)**:
     - Check if child modules are used elsewhere
     - If child modules are used, update imports to reference child modules directly first
     - Only delete barrel file after updating all imports

5. [human-in-the-loop] Present list for confirmation

#### Phase 3: Analyze Unused Exports

6. Analyze exports across all folders systematically
7. Find unused type definitions (`export type`, `export interface`)

#### Phase 4: Identify Dead Code Patterns

8. Search for:
   - Empty files: `find src -name "*.ts" -type f -size 0`
   - Code after return/throw statements
   - Unused function parameters

#### Phase 5: Generate Report

9. Create cleanup report with:
   - Unused files
   - Unused exports
   - Unused types
   - Dead code locations
   - Summary statistics
10. Save temporary report as `UNUSED_CODE_REPORT.md`
11. [human-in-the-loop] Review with user

#### Phase 6: Execute Cleanup

12. Delete unused files (with user approval)
13. Remove unused exports
14. Remove unused type definitions
15. Remove dead code

#### Phase 7: Clean Up Empty Directories

16. Find empty directories: `find src -type d -empty`
17. Delete empty directories

#### Phase 8: Verification

18. Run `npm run check` - fix any errors
19. Repeat Phase 1 (grep/find manual) to verify reduction

#### Phase 9: Finalization

20. Commit changes with message: `chore: remove unused code and dead code paths`
21. Delete the cleanup report

### Important Guidelines

**Do's:**
- Always create a backup branch before starting
- Document all findings before deleting
- Verify each file/export is truly unused
- Run verification steps after each major deletion

**Don'ts:**
- Never delete files without verification
- Never skip human-in-the-loop steps
- Never delete a barrel file without first updating imports to child modules
- Never remove side-effect imports

### Expected Outcomes

- **Unused files**: 2-10 unused source files identified and removed
- **Unused types**: Several unused type definitions removed
- **Empty directories**: 5-20 empty directories cleaned up
- **Code reduction**: 0.1-1% reduction in TypeScript files