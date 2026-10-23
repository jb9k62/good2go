---
type: Architectural Decision
title: "ADR-0009: Micro-worlds teach a concept as a ladder of small widgets"
description: Why a concept's widget is split into rungs (by hand, the surprise, at scale), why the kit gained a walkthrough and a predict-first control, and why the existing widget names stay.
tags: [adr, widgets, explainers, teaching]
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T08:29:08Z }
sources:
  - resource: src/templates/okf-widgets/src/kit.tsx
  - resource: src/templates/okf-widgets/src/index.tsx
  - resource: skills/good2go/references/EXPLAINERS.md
  - resource: examples/demo/okf/tours/bloom-explainer.md
  - resource: examples/demo/okf/tours/hashing-explainer.md
---

# ADR-0009: Micro-worlds teach a concept as a ladder of small widgets

- **Status:** accepted
- **Date:** 2026-10-23
- **Deciders:** the maintainers

## Context

Each demo tour paired one real computer-science idea with one widget. The ideas were well
chosen, but readers said they did not click. Reading the widgets showed why:

- **They opened at full scale.** `bloom-filter` started at 1,024 bits, 100 keys and 7 hashes,
  with three sliders and two percentages. The tour said "hash it a few times and set those
  bits", and the reader never saw one key light its bits.
- **They showed statistics, not things.** "Busiest server 2.3x the average" is a conclusion;
  a reader needs to watch one key move before the percentage means anything.
- **They split the reader's attention.** What to do was in the tour above the widget, and
  what it meant was in a note below it.
- **They told instead of asking.** A preset showed the answer before the reader had a guess
  of their own.
- **They taught several ideas at once,** against the explainer guide's own rule.

## Decision

A concept with a widget is taught as a **ladder** of two or three widgets, one idea each:

1. **By hand**: a tiny, discrete world (16 bits, 3 servers, 12 keys) that the reader steps
   through, with one sentence per step next to the picture, then takes over.
2. **The surprise**: the same small world set up to fail. The reader predicts before the
   outcome is shown, and the widget names the items that caused it.
3. **At scale**: the full widget, with sliders and measured rates.

The kit gains `useSteps` and `Steps` (the walkthrough; its Next button is the render gate's
probe) and `Predict` (keeps an outcome covered until the reader guesses). Rungs are separate
registered widgets named for what they show (`bloom-add`, `bloom-stranger`), and the tour
places a one-question check after each. The Bloom filter and consistent-hashing tours are
the worked examples; the other demo concepts follow once these two have been reviewed.

## Consequences

- Each rung is small enough to read in a minute, and later rungs can rely on earlier ones.
- More widgets to build and maintain: two more per concept, each with a test. The models are
  shared, so the logic is not duplicated.
- Small worlds are noisy, so their names must be chosen for a typical result, and the numbers
  a tour quotes are pinned in tests.
- Existing widget names and behaviour are unchanged, so concepts in projects scaffolded
  earlier keep working.

## Alternatives considered

| Option | Why not |
| --- | --- |
| One widget with a `stage` line in its block | Mixes stage with the data lines some widgets read, and one component grows three modes |
| A series of separate tours per concept | Three pages for one idea; the explainer guide keeps one idea per tour, and a ladder is one idea, built up |
| Simplify the existing widgets in place | Loses the at-scale view, which is where tuning is learnt |
