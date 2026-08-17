# Week Manager maintainer instructions

This repository is Anant's personal planning source. Keep it calm, concrete, and low-maintenance.

## When Anant gives new life updates

1. Read `MANAGER.md` completely before editing.
2. Extract facts, deadlines, status changes, next actions, dependencies, and still-missing information from plain language or pasted messages.
3. Update the smallest relevant tables in `MANAGER.md`. Use stable lowercase hyphenated IDs.
4. Distinguish explicitly supplied hard deadlines from self-imposed safety deadlines. Label assumptions in `Notes`; never present an inferred date as official.
5. A commitment needs a concrete next action. A major event normally needs separate preparation, logistics, and follow-up tasks—not one vague checkbox.
6. If a date or detail is missing, add or update a `Waiting For` row rather than silently inventing it.
7. Convert externally stated time zones to Asia/Kolkata and retain the original time zone in `Notes` when deadline risk matters.
8. Update the top `Updated` date and `Current week` only when appropriate.
9. Run `npm test` after every data or application change.

## Applications and rejections

- Add every submitted job to `Applications`, including company, role, applied date, follow-up date, source link, and next action when known.
- Moving an application to rejected must also create or enrich a `Rejections` row with stage, observed signal, recovery action, and sensible reapplication date. Do not fabricate a rejection reason.
- Preserve the weekly target of 25 applications and stretch target of 50 unless Anant changes them.

## Hackathons and academics

- Track application deadline, selection stage, event dates, preparation deliverables, venue/travel, and post-event follow-up separately.
- Preserve the weekly RL SLP and Monday stochastic/probability quiz rhythms.
- Keep Interview and ML Prep as a dedicated section; do not scatter its items across an undifferentiated task dump.
- Never record confidential Akuna challenge content. Track only public instructions, preparation time, deadline, and submission status.

## Website behavior

- Keep a light-only, low-glare, high-contrast visual theme. Do not add a dark theme, neon accents, glassmorphism, gradients, or generic AI/SaaS styling.
- The Today view must continue to foreground at most three tasks.
- Preserve local-first browser storage and export/import. Never place API tokens in client-side files.
- GitHub Pages is static. Any Codex, Telegram, or Instagram credential must remain server-side or in repository secrets.

## Project skill

`sharpen-intent` is manual-only. Use it only when Anant explicitly asks to sharpen, pressure-test, interrogate, stress-test, or grill an idea. Do not activate it for ordinary build or update requests.
