/**
 * Test-list pickers: the "Show" list for Type / Suite / Category, the Milestone 2 area list and the searchable
 * endpoint combobox (type-ahead on method, path and name). Every option carries its count and pass / fail / blocked.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from '../icons';
import { tallyText, type Tally } from '../store';

export interface ValueOption {
  value: string;
  label: string;
  tally: Tally;
}

/** A labelled native <select> (keyboard and screen-reader friendly), options "Label (n) · p ✓ · f ✗ · b ⛔". */
export function TallySelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ValueOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label class="picker">
      <span class="groupby__label">{label}</span>
      <span class="picker__select">
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} {tallyText(o.tally)}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={14} />
      </span>
    </label>
  );
}

export interface EndpointOption {
  key: string;
  method: string;
  path: string;
  name: string;
  tally: Tally;
}

/**
 * Searchable endpoint picker (ARIA combobox + listbox). The first option is always "All" (allLabel). Typing filters on
 * method + path + name (every word must match); ↑ ↓ move, Enter picks, Esc closes.
 */
export function EndpointCombobox({
  label,
  allLabel,
  allTally,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  allTally: Tally;
  value: string;
  options: EndpointOption[];
  onChange: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useMemo(() => `combo-${label.replace(/\W+/g, '-').toLowerCase()}`, [label]);

  const all: EndpointOption = { key: '', method: '', path: '', name: allLabel, tally: allTally };
  const results = useMemo(() => {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = tokens.length
      ? options.filter((o) =>
          tokens.every((t) => `${o.method} ${o.path} ${o.name} ${o.key}`.toLowerCase().includes(t)),
        )
      : options;
    return [all, ...hits];
  }, [q, options, allLabel, allTally]);
  const current = options.find((o) => o.key === value);
  const shown = current ? `${current.method} ${current.path}`.trim() || current.name : allLabel;

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    if (open) listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel, open]);

  const choose = (o: EndpointOption | undefined) => {
    if (!o) return;
    onChange(o.key);
    setOpen(false);
    setQ('');
  };

  return (
    <div class="picker combo">
      <span class="groupby__label" id={`${id}-label`}>
        {label}
      </span>
      <div class="combo__field popover-anchor">
        <Icon name="search" size={14} />
        <input
          role="combobox"
          aria-labelledby={`${id}-label`}
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${id}-opt-${sel}` : undefined}
          placeholder={shown}
          value={open ? q : shown}
          title={current ? `${current.method} ${current.path} — ${current.name}` : allLabel}
          onFocus={() => {
            setOpen(true);
            setQ('');
          }}
          onClick={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onInput={(e) => {
            setQ((e.target as HTMLInputElement).value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (!open) setOpen(true);
              else setSel((s) => Math.min(results.length - 1, s + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((s) => Math.max(0, s - 1));
            } else if (e.key === 'Enter' && open) {
              e.preventDefault();
              choose(results[sel]);
            } else if (e.key === 'Escape' && open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              setQ('');
            }
          }}
        />
        <Icon name="chevronDown" size={14} />
        {open && (
          <ul class="popover glass glass--strong combo__list" id={`${id}-list`} role="listbox" ref={listRef}>
            {results.length === 1 && q && <li class="palette__group">No endpoint matches “{q}”</li>}
            {results.map((o, i) => (
              <li
                key={o.key || '__all'}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === sel}
                data-current={o.key === value}
                class="combo__opt"
                onMouseEnter={() => setSel(i)}
                // mousedown (not click) so the input's blur does not close the list first
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o);
                }}
              >
                <span class="combo__main">
                  {o.method && <span class={`method method--${o.method}`}>{o.method}</span>}
                  {o.path ? <code class="combo__path">{o.path}</code> : <strong>{o.name}</strong>}
                </span>
                <span class="combo__sub">
                  {o.path && <span class="combo__name">{o.name}</span>}
                  <span class="combo__tally">{tallyText(o.tally)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
