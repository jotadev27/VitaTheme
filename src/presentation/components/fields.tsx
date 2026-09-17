import { useState, type ReactElement, type ReactNode } from 'react';
import { formatThemeColor, parseThemeColor, type ThemeColor } from '@/domain/model/theme-color';

/**
 * The controls a theme is edited with.
 *
 * Each one holds what is being typed and nothing else: the value it shows comes from the
 * theme, and a change is announced rather than applied. The theme itself lives on the other
 * side of the bridge, so there is no second copy here to fall out of step with it.
 */

/**
 * Keeps what somebody is typing apart from what the theme says.
 *
 * The draft is replaced whenever the theme's own value changes — which is what happens after
 * a change is accepted, and when a different theme is opened. React sanctions adjusting state
 * during a render for exactly this.
 */
const useDraft = <TValue,>(value: TValue): [TValue, (next: TValue) => void, () => void] => {
  const [draft, setDraft] = useState(value);
  const [settled, setSettled] = useState(value);

  if (value !== settled) {
    setSettled(value);
    setDraft(value);
  }

  return [
    draft,
    setDraft,
    () => {
      setDraft(settled);
    },
  ];
};

export const Field = ({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string | undefined;
  readonly children: ReactNode;
}): ReactElement => (
  <label className="field">
    <span className="field-label">{label}</span>
    {children}
    {hint === undefined ? null : <span className="field-hint">{hint}</span>}
  </label>
);

export const TextField = ({
  label,
  value,
  placeholder,
  hint,
  maxLength = 200,
  onCommit,
}: {
  readonly label: string;
  readonly value: string;
  readonly placeholder?: string | undefined;
  readonly hint?: string | undefined;
  readonly maxLength?: number | undefined;
  readonly onCommit: (value: string) => void;
}): ReactElement => {
  const [draft, setDraft, revert] = useDraft(value);

  const commit = (): void => {
    if (draft !== value) {
      onCommit(draft);
    }
  };

  return (
    <Field label={label} hint={hint}>
      <input
        className="field-input"
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            revert();
          }
        }}
      />
    </Field>
  );
};

export const NumberField = ({
  label,
  value,
  placeholder = 'Not set',
  hint,
  onCommit,
}: {
  readonly label: string;
  readonly value: number | null;
  readonly placeholder?: string | undefined;
  readonly hint?: string | undefined;
  readonly onCommit: (value: number | null) => void;
}): ReactElement => {
  const [draft, setDraft, revert] = useDraft(value === null ? '' : String(value));

  const commit = (): void => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      if (value !== null) {
        onCommit(null);
      }
      return;
    }

    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isInteger(parsed) && parsed !== value) {
      onCommit(parsed);
    }
  };

  return (
    <Field label={label} hint={hint}>
      <input
        className="field-input field-input-narrow numeric"
        value={draft}
        inputMode="numeric"
        placeholder={placeholder}
        onChange={(event) => {
          setDraft(event.target.value.replace(/[^\d-]/g, ''));
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            revert();
          }
        }}
      />
    </Field>
  );
};

const PICKER_PREFIX = '#';

const toPickerValue = (color: ThemeColor | null): string => {
  if (color === null) {
    return '#000000';
  }
  const hex = formatThemeColor(color);
  return `${PICKER_PREFIX}${hex.length === 8 ? hex.slice(2) : hex}`;
};

/**
 * A theme colour, in the notation the manifest uses.
 *
 * Both forms the format accepts are offered — six digits, or eight to include transparency —
 * and whichever the theme already used is kept when the picker changes the colour, so
 * editing one value does not quietly rewrite what the rest of the file looks like.
 */
export const ColorField = ({
  label,
  value,
  hint,
  onCommit,
}: {
  readonly label: string;
  readonly value: ThemeColor | null;
  readonly hint?: string | undefined;
  readonly onCommit: (value: string | null) => void;
}): ReactElement => {
  const current = value === null ? '' : formatThemeColor(value);
  const [draft, setDraft, revert] = useDraft(current);

  const parsed = draft.trim().length === 0 ? null : parseThemeColor(draft);
  const malformed = parsed !== null && !parsed.ok;

  const commit = (): void => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      if (value !== null) {
        onCommit(null);
      }
      return;
    }
    if (!malformed && trimmed.toUpperCase() !== current) {
      onCommit(trimmed);
    }
  };

  const pick = (picked: string): void => {
    const digits = picked.replace(PICKER_PREFIX, '').toUpperCase();
    const alpha = value?.hasExplicitAlpha === true ? formatThemeColor(value).slice(0, 2) : '';
    onCommit(`${alpha}${digits}`);
  };

  return (
    <Field label={label} hint={hint}>
      <span className="colour-field">
        <input
          type="color"
          className="colour-picker"
          value={toPickerValue(value)}
          aria-label={`${label} picker`}
          onChange={(event) => {
            pick(event.target.value);
          }}
        />
        <input
          className="field-input mono"
          value={draft}
          maxLength={8}
          placeholder="Not set"
          aria-invalid={malformed}
          onChange={(event) => {
            setDraft(event.target.value.replace(/[^0-9a-fA-F]/g, '').toUpperCase());
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
            if (event.key === 'Escape') {
              revert();
            }
          }}
        />
        {value === null ? null : (
          <button
            type="button"
            className="btn btn-quiet btn-small"
            onClick={() => {
              onCommit(null);
            }}
          >
            Clear
          </button>
        )}
      </span>
    </Field>
  );
};

export interface ChoiceOption<TValue> {
  readonly value: TValue;
  readonly label: string;
}

export const ChoiceField = <TValue extends string>({
  label,
  value,
  options,
  hint,
  onCommit,
}: {
  readonly label: string;
  readonly value: TValue;
  readonly options: readonly ChoiceOption<TValue>[];
  readonly hint?: string | undefined;
  readonly onCommit: (value: TValue) => void;
}): ReactElement => (
  <Field label={label} hint={hint}>
    <select
      className="field-input"
      value={value}
      onChange={(event) => {
        onCommit(event.target.value as TValue);
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </Field>
);

/**
 * A setting a theme can leave alone.
 *
 * "Not set" is a real state and not the same as off: the console applies its own default for
 * anything a theme does not specify, so the difference has to be visible and reachable.
 */
export const TriStateField = ({
  label,
  value,
  onCommit,
  offLabel = 'Off',
  onLabel = 'On',
}: {
  readonly label: string;
  readonly value: boolean | null;
  readonly onCommit: (value: boolean | null) => void;
  readonly offLabel?: string | undefined;
  readonly onLabel?: string | undefined;
}): ReactElement => {
  const choices: readonly {
    readonly id: string;
    readonly value: boolean | null;
    readonly label: string;
  }[] = [
    { id: 'unset', value: null, label: 'Not set' },
    { id: 'off', value: false, label: offLabel },
    { id: 'on', value: true, label: onLabel },
  ];

  return (
    <Field label={label}>
      <span className="segmented" role="group" aria-label={label}>
        {choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            className="toggle"
            aria-pressed={value === choice.value}
            onClick={() => {
              onCommit(choice.value);
            }}
          >
            {choice.label}
          </button>
        ))}
      </span>
    </Field>
  );
};
