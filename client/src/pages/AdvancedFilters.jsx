/**
 * Owner: Person 3 (Jorel) - Screener / Filter Engine (filter UI).
 * Advanced Filters: enable criteria per section, set min/max ranges (inputs +
 * dual slider), optional weighting, exchange filter and default exclusions.
 * "Apply Filters" runs POST /api/screener/run and returns to the Screener.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart2, TrendingUp, DollarSign, RotateCcw, Info, ChevronDown, ChevronUp, Play } from "lucide-react";
import { useScreener } from "../context/ScreenerContext";
import { CRITERIA_META, SECTIONS, EXCHANGES, DEFAULT_EXCLUDED_SECTORS } from "../screener/criteria";

const SECTION_ICONS = {
  "Size & Valuation": <BarChart2 size={15} />,
  Profitability: <TrendingUp size={15} />,
  "Income & Stability": <DollarSign size={15} />,
};

/** Dual-thumb slider + min/max inputs for one criterion (values in UI units). */
function RangeControl({ meta, value, onChange }) {
  const { min: lo, max: hi, step } = meta.slider;
  const minVal = value.min ?? lo;
  const maxVal = value.max ?? hi;
  const pct = (v) => ((v - lo) / (hi - lo)) * 100;

  return (
    <div>
      <div className="dual-range">
        <div className="dual-range-track" />
        <div
          className="dual-range-fill"
          style={{ left: `${pct(Math.max(minVal, lo))}%`, width: `${Math.max(0, pct(Math.min(maxVal, hi)) - pct(Math.max(minVal, lo)))}%` }}
        />
        <input
          type="range"
          min={lo}
          max={hi}
          step={step}
          value={Math.min(Math.max(minVal, lo), hi)}
          onChange={(e) => onChange({ ...value, min: Math.min(Number(e.target.value), maxVal) })}
          aria-label={`${meta.label} minimum`}
        />
        <input
          type="range"
          min={lo}
          max={hi}
          step={step}
          value={Math.min(Math.max(maxVal, lo), hi)}
          onChange={(e) => onChange({ ...value, max: Math.max(Number(e.target.value), minVal) })}
          aria-label={`${meta.label} maximum`}
        />
      </div>
      <div className="range-bounds">
        <span>
          {lo}
          {meta.unit}
          {minVal <= lo ? " (no min)" : ""}
        </span>
        <span>
          {hi}
          {meta.unit}+{maxVal >= hi ? " (no max)" : ""}
        </span>
      </div>
    </div>
  );
}

function FilterRow({ critKey, state, onChange }) {
  const meta = CRITERIA_META[critKey];
  const enabled = state.enabled;

  const set = (patch) => onChange({ ...state, ...patch });

  return (
    <div className="filter-row" style={{ opacity: enabled ? 1 : 0.55 }}>
      <div className="filter-row-top">
        <div>
          <div className="filter-row-label">
            <input
              type="checkbox"
              className="crit-toggle"
              checked={enabled}
              onChange={(e) => set({ enabled: e.target.checked })}
              aria-label={`Enable ${meta.label} filter`}
            />
            {meta.label}
            <span title={meta.tooltip} style={{ color: "var(--color-muted-text)", display: "inline-flex" }}>
              <Info size={13} />
            </span>
          </div>
          <div className="filter-tooltip">{meta.tooltip}</div>
        </div>
        <div className="range-inputs">
          <input
            type="number"
            className="range-input"
            placeholder="min"
            step={meta.slider.step}
            value={state.min ?? ""}
            disabled={!enabled}
            onChange={(e) => set({ min: e.target.value === "" ? null : Number(e.target.value) })}
          />
          <span className="range-sep">to</span>
          <input
            type="number"
            className="range-input"
            placeholder="max"
            step={meta.slider.step}
            value={state.max ?? ""}
            disabled={!enabled}
            onChange={(e) => set({ max: e.target.value === "" ? null : Number(e.target.value) })}
          />
          <span className="range-sep">{meta.unit}</span>
          <span className="range-sep" style={{ marginLeft: 8 }}>
            weight
          </span>
          <select
            className="range-input"
            style={{ width: 58 }}
            value={state.weight ?? 0}
            disabled={!enabled}
            onChange={(e) => set({ weight: Number(e.target.value) })}
            aria-label={`${meta.label} weight`}
          >
            {[0, 1, 2, 3, 4, 5].map((w) => (
              <option key={w} value={w}>
                {w || "—"}
              </option>
            ))}
          </select>
        </div>
      </div>
      {enabled && (
        <RangeControl
          meta={meta}
          value={{ min: state.min, max: state.max }}
          onChange={(v) => set({ min: v.min, max: v.max })}
        />
      )}
    </div>
  );
}

function FilterSection({ title, keys, values, onChange }) {
  const [open, setOpen] = useState(true);
  const activeCount = keys.filter((k) => values[k].enabled).length;

  return (
    <div className="card filter-section">
      <button type="button" className="filter-section-head" onClick={() => setOpen((o) => !o)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--color-dark-menu)" }}>
          <span style={{ color: "var(--color-clickable)", display: "inline-flex" }}>{SECTION_ICONS[title]}</span>
          {title}
          <span className={`chip ${activeCount ? "chip-good" : ""}`} style={{ fontSize: 11 }}>
            {activeCount} of {keys.length} active
          </span>
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && keys.map((k) => <FilterRow key={k} critKey={k} state={values[k]} onChange={(s) => onChange(k, s)} />)}
    </div>
  );
}

/** Convert stored criteria (raw API units) into per-key UI state (UI units). */
function toUiState(criteria) {
  const state = {};
  for (const key of Object.keys(CRITERIA_META)) {
    const meta = CRITERIA_META[key];
    const existing = criteria.find((c) => c.key === key);
    state[key] = {
      enabled: !!existing,
      min: existing?.min != null ? existing.min / meta.scale : null,
      max: existing?.max != null ? existing.max / meta.scale : null,
      weight: existing?.weight ?? 0,
    };
  }
  return state;
}

export default function AdvancedFilters() {
  const navigate = useNavigate();
  const {
    criteria,
    setCriteria,
    exchanges,
    setExchanges,
    excludeSectors,
    setExcludeSectors,
    minCompanyAgeYears,
    setMinCompanyAgeYears,
    runScreen,
    loading,
  } = useScreener();

  const [values, setValues] = useState(() => toUiState(criteria));
  const [localExchanges, setLocalExchanges] = useState(exchanges);
  const [localSectors, setLocalSectors] = useState(excludeSectors);
  const [localMinAge, setLocalMinAge] = useState(minCompanyAgeYears);

  const sectionKeys = useMemo(() => {
    const map = Object.fromEntries(SECTIONS.map((s) => [s, []]));
    for (const [key, meta] of Object.entries(CRITERIA_META)) map[meta.section].push(key);
    return map;
  }, []);

  const activeCount = Object.values(values).filter((v) => v.enabled).length;

  function buildCriteria() {
    return Object.entries(values)
      .filter(([, v]) => v.enabled)
      .map(([key, v]) => {
        const meta = CRITERIA_META[key];
        // A slider pushed to its extreme means "no bound in that direction" —
        // otherwise maxing out Market Cap at $500B would exclude mega-caps.
        const min = v.min != null && v.min > meta.slider.min ? v.min : null;
        const max = v.max != null && v.max < meta.slider.max ? v.max : null;
        return {
          key,
          label: meta.label,
          ...(min != null ? { min: min * meta.scale } : {}),
          ...(max != null ? { max: max * meta.scale } : {}),
          ...(v.weight ? { weight: v.weight } : {}),
        };
      })
      .filter((c) => c.min != null || c.max != null || c.weight != null);
  }

  async function handleApply() {
    const nextCriteria = buildCriteria();
    setCriteria(nextCriteria);
    setExchanges(localExchanges);
    setExcludeSectors(localSectors);
    setMinCompanyAgeYears(Number(localMinAge) || 0);
    const data = await runScreen({
      criteria: nextCriteria,
      ...(localExchanges.length ? { exchanges: localExchanges } : { exchanges: undefined }),
      excludeSectors: localSectors,
      minCompanyAgeYears: Number(localMinAge) || 0,
    });
    if (data) navigate("/");
  }

  function handleReset() {
    const cleared = {};
    for (const key of Object.keys(CRITERIA_META)) cleared[key] = { enabled: false, min: null, max: null, weight: 0 };
    setValues(cleared);
    setLocalExchanges([]);
    setLocalSectors(DEFAULT_EXCLUDED_SECTORS);
    setLocalMinAge(5);
  }

  const toggle = (list, item) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1 className="page-title">Advanced Filters</h1>
          <p className="page-subtitle">Refine your screen with granular criteria, then apply to run it on the database.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="chip chip-good">Filters active: {activeCount}</span>
          <button className="btn btn-ghost" onClick={handleReset}>
            <RotateCcw size={13} />
            Reset
          </button>
        </div>
      </div>

      {SECTIONS.map((s) => (
        <FilterSection
          key={s}
          title={s}
          keys={sectionKeys[s]}
          values={values}
          onChange={(k, st) => setValues((prev) => ({ ...prev, [k]: st }))}
        />
      ))}

      {/* Universe & exclusions */}
      <div className="card filter-section">
        <div className="filter-section-head" style={{ cursor: "default" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "var(--color-clickable)", display: "inline-flex" }}>
              <Info size={15} />
            </span>
            Universe &amp; Exclusions
          </span>
        </div>
        <div className="filter-row">
          <div className="filter-row-top">
            <div className="filter-row-label">Exchanges</div>
            <div style={{ display: "flex", gap: 8 }}>
              {EXCHANGES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className={`chip ${localExchanges.includes(ex) ? "chip-accent" : ""}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => setLocalExchanges((prev) => toggle(prev, ex))}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-tooltip">No selection = all exchanges.</div>
        </div>
        <div className="filter-row">
          <div className="filter-row-top">
            <div className="filter-row-label">Excluded sectors</div>
            <div style={{ display: "flex", gap: 8 }}>
              {DEFAULT_EXCLUDED_SECTORS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  className={`chip ${localSectors.includes(sec) ? "chip-special" : ""}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => setLocalSectors((prev) => toggle(prev, sec))}
                >
                  {sec}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-tooltip">Gambling and tobacco are excluded by default per the requirements.</div>
        </div>
        <div className="filter-row">
          <div className="filter-row-top">
            <div className="filter-row-label">Minimum company age</div>
            <div className="range-inputs">
              <input
                type="number"
                className="range-input"
                min={0}
                value={localMinAge}
                onChange={(e) => setLocalMinAge(e.target.value)}
              />
              <span className="range-sep">years listed</span>
            </div>
          </div>
          <div className="filter-tooltip">Companies younger than this are excluded (default 5 years).</div>
        </div>
      </div>

      {/* Apply bar */}
      <div
        className="card card-pad"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", bottom: 12 }}
      >
        <span className="page-subtitle">
          {activeCount} criteria will be sent to the filter engine
          {activeCount > 0 &&
            ` — e.g. ${Object.entries(values)
              .filter(([, v]) => v.enabled)
              .slice(0, 2)
              .map(([k, v]) => `${CRITERIA_META[k].label} ${v.min ?? "…"}–${v.max ?? "…"}${CRITERIA_META[k].unit}`)
              .join(", ")}`}
        </span>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => navigate("/")}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleApply} disabled={loading}>
            <Play size={14} />
            {loading ? "Running…" : "Apply Filters"}
          </button>
        </div>
      </div>
    </section>
  );
}
