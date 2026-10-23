/**
 * The shared pieces of a micro-world, so every widget in a project reads the same way. The
 * example widgets use all of them; a new widget should too.
 */

import { useState, type ReactNode } from 'react';

export interface PresetOption {
  id: string;
  label: string;
}

/**
 * Buttons that jump to the cases worth seeing. Mark exactly one as `probe`: the viewer's render
 * gate clicks it and fails the build if the widget's text does not change.
 */
export function Presets<T extends PresetOption>({
  presets,
  active,
  probe,
  onChoose,
}: {
  presets: readonly T[];
  active: string | null;
  probe: string;
  onChoose: (preset: T) => void;
}) {
  return (
    <div className="okfw-presets" role="group" aria-label="Presets">
      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          aria-pressed={preset.id === active}
          data-probe={preset.id === probe || undefined}
          onClick={() => onChoose(preset)}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

/** The widget's result as label/value rows. */
export function Facts({
  rows,
  testId,
}: {
  rows: ReadonlyArray<readonly [label: ReactNode, value: ReactNode]>;
  testId?: string;
}) {
  return (
    <dl className="okfw-facts" data-testid={testId}>
      {rows.map(([label, value], index) => (
        <div key={index} style={{ display: 'contents' }}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Explanation of the active preset, or a warning when the reader breaks an invariant. */
export function Note({ tone = 'note', children }: { tone?: 'note' | 'warn'; children: ReactNode }) {
  return tone === 'warn' ? (
    <p className="okfw-warn" role="status">
      {children}
    </p>
  ) : (
    <p className="okfw-note">{children}</p>
  );
}

/**
 * The honesty line every widget ends with: which parts run the project's real code and which
 * are a model of it. A reader who cannot tell the two apart cannot trust either.
 */
export function ModelNote({ children }: { children: ReactNode }) {
  return <p className="okfw-model">{children}</p>;
}

/** A preset that carries the whole state it jumps to, and the note that explains it. */
export interface WorldPreset<S> extends PresetOption {
  state: S;
  note: ReactNode;
}

/**
 * The state of a micro-world: one object, the preset that produced it (if the reader has not
 * touched anything since), and `set` for direct control. Editing anything clears the active
 * preset, so its note never describes a state the reader has left. Keep the state minimal and
 * derive everything else from the model on each render.
 */
export function useWorld<S extends object>(presets: readonly WorldPreset<S>[], initial = 0) {
  const first = presets[initial]!;
  const [state, setState] = useState<S>(first.state);
  const [presetId, setPresetId] = useState<string | null>(first.id);
  return {
    state,
    preset: presets.find((candidate) => candidate.id === presetId) ?? null,
    set(patch: Partial<S>) {
      setState((current) => ({ ...current, ...patch }));
      setPresetId(null);
    },
    choose(preset: WorldPreset<S>) {
      setState(preset.state);
      setPresetId(preset.id);
    },
  };
}

/**
 * One step of a guided walkthrough: the whole state it shows, and what a teacher would say about
 * it, in a sentence or two.
 */
export interface Step<S> {
  state: S;
  say: ReactNode;
}

/**
 * The state of a walkthrough: the reader steps through `steps` in order, each carrying the whole
 * state it shows. `set` lets the reader take over and play; the walkthrough then steps aside
 * until they go back to it. Like `useWorld`, keep the state minimal and derive the rest.
 */
export function useSteps<S extends object>(steps: readonly Step<S>[]) {
  const [index, setIndex] = useState(0);
  const [own, setOwn] = useState<S | null>(null);
  const at = Math.min(index, steps.length - 1);
  return {
    index: at,
    count: steps.length,
    state: own ?? steps[at]!.state,
    /** The step being shown, or null once the reader has taken over. */
    step: own ? null : steps[at]!,
    go(next: number) {
      setIndex(Math.min(Math.max(next, 0), steps.length - 1));
      setOwn(null);
    },
    set(patch: Partial<S>) {
      setOwn((current) => ({ ...(current ?? steps[at]!.state), ...patch }));
    },
  };
}

/**
 * The walkthrough's voice and its Back/Next buttons. Put it right under the picture, so what the
 * reader is told sits next to what they see. Next carries `data-probe` for the render gate.
 */
export function Steps({
  walk,
}: {
  walk: { index: number; count: number; step: Step<unknown> | null; go: (next: number) => void };
}) {
  const { index, count, step } = walk;
  return (
    <div className="okfw-steps">
      <p className="okfw-say" aria-live="polite" data-testid="step-say">
        {step ? (
          <>
            <span className="okfw-step-count">
              Step {index + 1} of {count}
            </span>{' '}
            {step.say}
          </>
        ) : (
          <>You are exploring on your own. Go back to the walkthrough at any time.</>
        )}
      </p>
      <div className="okfw-step-buttons">
        {step ? (
          <>
            <button type="button" disabled={index === 0} onClick={() => walk.go(index - 1)}>
              ◀ Back
            </button>
            <button type="button" data-probe disabled={index >= count - 1} onClick={() => walk.go(index + 1)}>
              Next ▶
            </button>
          </>
        ) : (
          <button type="button" data-probe onClick={() => walk.go(index)}>
            Back to step {index + 1}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Ask the reader to commit to a guess before showing what happens. The outcome (`children`)
 * stays covered until they choose; then it appears with whether they were right and why. A
 * reader who is surprised remembers. Give it a `key` that changes with the question, so a new
 * question starts unanswered.
 */
export function Predict({
  question,
  options,
  answer,
  why,
  children,
}: {
  question: ReactNode;
  options: readonly { id: string; label: string }[];
  answer: string;
  why: ReactNode;
  children: ReactNode;
}) {
  const [guess, setGuess] = useState<string | null>(null);
  const right = options.find((option) => option.id === answer);
  return (
    <div className="okfw-predict" data-answered={guess !== null}>
      <p className="okfw-predict-q">
        <strong>Predict:</strong> {question}
      </p>
      <div className="okfw-presets" role="group" aria-label="Your prediction">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={option.id === guess}
            disabled={guess !== null}
            onClick={() => setGuess(option.id)}
          >
            {option.label}
          </button>
        ))}
        {guess === null && (
          <button type="button" className="okfw-skip" onClick={() => setGuess('')}>
            Just show me
          </button>
        )}
      </div>
      {guess === null ? (
        <p className="okfw-reason">Make a guess, then see what happens.</p>
      ) : (
        <>
          <p className="okfw-verdict" role="status" data-right={guess === answer}>
            {guess === '' ? (
              <>
                The answer: <strong>{right?.label}</strong>.
              </>
            ) : guess === answer ? (
              <>
                <strong>Right.</strong>
              </>
            ) : (
              <>
                <strong>Not quite:</strong> it is “{right?.label}”.
              </>
            )}{' '}
            {why}
          </p>
          {children}
        </>
      )}
    </div>
  );
}

/** A labelled range input. The label is the accessible name; `format` shapes the value shown. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  format = String,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="okfw-row">
      {label}{' '}
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />{' '}
      {format(value)}
    </label>
  );
}

/** A checkbox with an optional one-line reason beneath it. */
export function Toggle({
  label,
  reason,
  checked,
  onChange,
}: {
  label: ReactNode;
  reason?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="okfw-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{' '}
      {label}
      {reason && <span className="okfw-reason">{reason}</span>}
    </label>
  );
}

/** A minimal histogram, one bar per value, scaled to the largest. Decorative: say it in text too. */
export function BarChart({ values, label }: { values: readonly number[]; label?: string }) {
  const peak = Math.max(0, ...values);
  return (
    <div className="okfw-bars" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {values.map((value, index) => (
        <span key={index} style={{ height: `${peak ? (value / peak) * 100 : 0}%` }} />
      ))}
    </div>
  );
}

/**
 * Shown instead of the widget when the data a concept gave it cannot be read. Say which line,
 * and what was expected: the author is about to fix it, and a silent fallback would hide it.
 */
export function SourceProblem({ error }: { error: unknown }) {
  return (
    <p className="okfw-error">
      Could not read this widget's data: {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

/** One of several exclusive options, as a row of buttons (a policy, a mode). No probe: see Presets. */
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="okfw-presets" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Step through a sequence one item at a time (requests, comparisons, frames). The slider and the
 * two buttons all move the same position; `value` is 0-based and `max` is the last position.
 */
export function Scrubber({
  label,
  value,
  max,
  onChange,
  describe,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
  describe?: (value: number) => ReactNode;
}) {
  const clamped = Math.min(Math.max(value, 0), Math.max(max, 0));
  return (
    <div className="okfw-scrubber">
      <button type="button" aria-label={`${label}: previous`} disabled={clamped <= 0} onClick={() => onChange(clamped - 1)}>
        ◀
      </button>
      <input
        type="range"
        aria-label={label}
        min={0}
        max={Math.max(max, 0)}
        value={clamped}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <button type="button" aria-label={`${label}: next`} disabled={clamped >= max} onClick={() => onChange(clamped + 1)}>
        ▶
      </button>
      <span className="okfw-scrubber-text">{describe ? describe(clamped) : `${clamped + 1} of ${max + 1}`}</span>
    </div>
  );
}
