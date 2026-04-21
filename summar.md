# HTMLLeaf Studio Change Report

## Summary

The repo was upgraded from a fragile one-file prototype into a local-first, grid-based editor workspace that can run on GitHub Pages without a backend. The new version keeps the simple static deployment model, but adds stronger project management, safer preview isolation, working page controls, diagnostics, outline navigation, autosave, and optional Supabase cloud sync.

## Major Changes

- Rebuilt the UI around a three-column CSS grid: project rail, source/preview workspace, and inspector.
- Replaced the previous fatal Supabase dependency with optional cloud configuration.
- Added local-first project storage using `localStorage`, including autosave, new project creation, import, delete, and template creation.
- Added a professional inspector with document setup, outline, diagnostics, word count, character count, and reading time.
- Added a safer sandboxed preview iframe without `allow-same-origin`.
- Added a separate sanitized PDF export path that strips scripts, event handlers, unsafe URLs, iframes, forms, and embeds before rendering.
- Wired page size, orientation, margin, and preview zoom into compile/export behavior.
- Replaced the single giant-page PDF export with multipage PDF slicing.
- Added CodeMirror HTML mixed mode support plus a textarea fallback if CodeMirror fails to load.
- Added template starters for research paper, formal letter, and technical report.
- Added basic formatting, snippets, notes, callouts, fullscreen preview, HTML export, and keyboard shortcuts.

## Bugs And Inconsistencies Fixed

- Fixed the startup crash caused by references to `sb.auth` and `sb.from(...)` when no Supabase client existed.
- Fixed cloud auth being mandatory for saving by making saving local-first.
- Fixed page controls that previously recompiled but did not affect output.
- Fixed unsafe same-origin preview sandboxing.
- Fixed PDF export depending on reading back from a permissive iframe.
- Fixed the old cloud project flow having weak error handling.
- Fixed missing fallback behavior for failed CDN/editor loads.
- Fixed the old one-panel layout being cramped and less professional.
- Fixed project persistence being cloud-only.

## Idea Analysis

The idea is strong: an HTML-native writing studio can be lighter than LaTeX while still exporting clean PDFs. It is especially useful for students, researchers, newsletters, technical notes, and people who understand HTML better than TeX.

The main weakness is that HTML is not automatically a professional publishing system. LaTeX wins at citations, references, equations, pagination, bibliography, cross-references, and deterministic typesetting. HTMLLeaf now narrows that gap with structured diagnostics, KaTeX support, paged export controls, templates, outline navigation, and safer compile/export behavior.

Another weakness is trust. User-authored HTML can contain scripts. The preview now runs in a sandbox without same-origin access, and PDF export uses a sanitized render path. This does not make arbitrary HTML perfectly safe, but it removes the biggest original risk.

The cloud story was previously brittle because the app assumed a Supabase backend but shipped no config or schema. The new version runs fully offline/local first, then enables Supabase only when configured. That keeps the public GitHub Pages app usable immediately.

## Remaining Gaps

- Add a real README with Supabase table schema and RLS policies.
- Add citation and bibliography helpers if the goal is to compete directly with LaTeX.
- Add cross-reference support for figures, tables, and equations.
- Add collaborative editing only after the data model is stable.
- Consider vendoring CDN dependencies or adding SRI hashes for stronger supply-chain reliability.

## Browser Smoke Test

Added `smoke-test.js` so the browser check is repeatable with:

```bash
node smoke-test.js
```

The smoke test launches headless Chrome through the DevTools Protocol, opens `index.html`, waits for the app to boot, clicks Compile, checks core UI state, verifies CodeMirror/KaTeX/PDF libraries, verifies local project persistence, verifies the preview sandbox does not include `allow-same-origin`, verifies page orientation affects the preview, captures a screenshot, and fails on runtime exceptions.

Latest result: passed.

- Failures: none
- Runtime exceptions: none
- CodeMirror rendered: yes
- PDF libraries loaded: yes
- KaTeX loaded: yes
- Local starter project created: yes
- Templates loaded: 3
- Compile status updated: yes
- Preview sandbox: `allow-scripts allow-popups allow-downloads`
- Page setting check: passed
- Screenshot: `smoke-test.png`

## Follow-Up Refinement

After testing the live editor, the PDF export and preview were refined again:

- Restored original-style PDF export as the default behavior: `Continuous, no split`.
- Kept paged PDF export as an optional advanced mode.
- Added smart page-break avoidance for paged export so code blocks, tables, figures, blockquotes, notes, images, and headings are less likely to be sliced.
- Added a `PDF export` selector in Document Setup.
- Added a fit-to-preview pass inside the sandboxed compiled document so wide pages do not look broken or clipped after Compile.
- Upgraded the visual design with a darker studio shell, signal-grid texture, stronger neon-accent controls, richer panel styling, and a small visual brand image.
- Updated `smoke-test.js` to verify continuous PDF export is the default, smart paged export functions exist, and the preview fit script is present.

## Scroll Refinement

- Added visible styled scrollbar rails for the project rail, inspector, CodeMirror editor, and compiled preview.
- Forced stable vertical scrollbar space where the app has scrollable panels.
- Added mouse-wheel routing so scrolling over nested editor/sidebar surfaces moves the correct panel.
- Added a wheel handler inside the sandboxed preview document.
- Updated `smoke-test.js` to verify editor mouse-wheel scrolling works and preview wheel support is injected.

## Scroll Bug Fix

- Fixed the actual root cause of inert editor scrolling: CodeMirror was expanding to the full height of its content instead of staying constrained inside the grid panel.
- Added explicit `min-height: 0` and fixed-height constraints for the workspace, editor panel, editor wrapper, CodeMirror, and CodeMirror scroll surface.
- Added a narrow CodeMirror-only wheel bridge that uses CodeMirror's own `scrollTo` API.
- Replaced the old synthetic wheel smoke check with real Chrome DevTools mouse-wheel input.
- Latest real-wheel test moved the editor from scroll top `0` to `900`, confirming the mouse wheel scrolls the source editor.

## UI Refresh And Exact Export

- Refreshed the studio shell with a stronger multi-layer grid treatment, warmer accent mix, deeper panel framing, and clearer preview presentation.
- Added a live studio summary card in the project rail so document count, template count, issue count, and PDF mode are visible at a glance.
- Added a dedicated `Founders` link in the top bar and created a standalone `founders.html` page.
- Added a built-in `Founders page` template so the same content structure is available directly inside the editor.
- Kept Rudra and Panavin visually equal on the founders page by using the same component, size, and hierarchy for both profiles.
- Changed the PDF export path so continuous export renders through an isolated sanitized export iframe instead of a padded hidden div. This preserves the original "capture the document itself" feel more closely and avoids baking extra outer borders into the exported PDF.
- Preserved paged export while allowing `Margin mm` to go down to `0` for edge-to-edge layouts.
- Preserved body and html attributes during preview and export generation so class-based and inline body styling survive more reliably.

## Latest Verification

- Re-ran `node smoke-test.js` after the UI and export changes.
- Result: passed with no runtime exceptions.
- CodeMirror rendered: yes
- Templates loaded: 4
- Continuous export default: yes
- Real wheel scroll: passed
- Preview sandbox still excludes `allow-same-origin`
- Screenshot refreshed: `smoke-test.png`

## Full-Page Preview Fix

- Changed the compiled preview default from a forced print-sheet frame to a full-page site canvas.
- Added a `Preview surface` control with `Full page` and `Print sheet` modes. Default is now `Full page`.
- Removed the decorative preview-stage border, padding, radius, and drop shadow that were making normal web pages feel trapped inside a frame.
- Kept print-sheet preview available when needed for page-sized documents.
- Added a targeted editorial polish pass for pages matching `The Mathematical Lie` markers:
  - upgraded the title and heading font pairing
  - replaced the muddy paper treatment with a cleaner editorial background
  - removed the forced sheet framing from the preview/exported result
- Updated HTML export so the downloaded HTML matches the improved preview/export appearance for that editorial page.
- Updated `smoke-test.js` so it now expects full-page preview as the default and switches into print-sheet mode only for page-setting verification.

## Editorial Overlap Fix

- Hardened the targeted editorial export pass after a real PDF overlap bug was reported on long masthead text.
- Replaced the unstable decorative heading treatment with a safer export font stack:
  - body copy uses Arial/Helvetica
  - headings use Georgia/Times
- Disabled ligatures, kerning tricks, and layout behavior that made some long titles render on top of themselves during PDF capture.
- Added automatic safe-wrap handling for long editorial headings:
  - headings now force normal wrapping
  - long single-token or CamelCase titles get soft break opportunities via `<wbr>`
  - long headings are marked for a smaller headline size during export
- Removed the forced centered editorial sheet from the full-page export styling.
- The editorial pass now uses a full-bleed body/background instead of a fixed-width `1200px` paper wrapper with auto margins.
- Added a regression check to `smoke-test.js` to confirm editorial exports keep the styling pass and inject safe heading breaks for titles like `TheMathematicalLie` and `1=2AnAlgebraCatastrophe`.

## Latest Verification

- Re-ran `node smoke-test.js` after the editorial overlap fix.
- Result: passed with no failures.
- Editorial export protection:
  - safe heading breaks injected: yes
  - long-heading size protection injected: yes
  - editorial style block present: yes
  - centered page frame removed: yes
