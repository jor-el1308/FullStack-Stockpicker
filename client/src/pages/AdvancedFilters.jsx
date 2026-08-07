/**
 * Owner: Person 3 (Jorel) - Screener / Filter Engine (filter UI).
 * Advanced Filters: enable criteria per section, set min/max ranges (inputs +
 * dual slider), optional weighting, exchange filter and default exclusions.
 * "Apply Filters" runs POST /api/screener/run and returns to the Screener.
 *
 * The sliders drag continuously along the piecewise scale defined by the stop
 * points in criteria.js `ticks` (see RangeControl below), and each one is
 * backed by a histogram of where the candidate stocks actually sit on that
 * axis, fetched from /api/screener/distribution.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BarChart2, TrendingUp, DollarSign, RotateCcw, Info, ChevronDown, ChevronUp, Play, Bookmark } from "lucide-react";
import { useScreener } from "../context/ScreenerContext";
import { useAuth } from "../context/AuthContext";
import { getDistribution } from "../api/stocks";
import { persistScreen } from "../screener/savedScreens";
import {
  CRITERIA_META,
  SECTIONS,
  EXCHANGES,
  DEFAULT_EXCLUDED_SECTORS,
  ticksFor,
  labelledTickIndices,
  formatTick,
  formatUiValue,
  positionOf,
  valueAtPosition,
  nudgeValue,
  clampToRange,
} from "../screener/criteria";
import { buildHistograms } from "../screener/distribution";

const SECTION_ICONS = {
  "Size & Valuation": <BarChart2 size={15} />,
  Profitability: <TrendingUp size={15} />,
  "Income & Stability": <DollarSign size={15} />,
};

/**
 * Distribution histogram sitting behind a slider. One bar per gap between two
 * stop points, so bars and track segments line up exactly.
 *
 * Bar heights use a square-root scale: these distributions are heavily
 * right-skewed (a handful of mega-caps, a long tail of small ones) and on a
 * linear scale every bar but the tallest collapses to a sliver.
 */
function SliderHistogram({ counts, max, ticks, unit, loMin, loMax }) {
  if (!counts?.length || !max) return null;
  const width = 100 / counts.length;
  return (
    <div className="slider-hist" aria-hidden="true">
      {counts.map((count, i) => {
        const inRange = ticks[i + 1] > loMin && ticks[i] < loMax;
        const height = count ? Math.max(8, Math.round((Math.sqrt(count) / Math.sqrt(max)) * 100)) : 0;
        const upper = i === counts.length - 1 ? `${formatTick(ticks[i + 1])}+` : formatTick(ticks[i + 1]);
        return (
          <div
            key={i}
            className="slider-hist-slot"
            // Absolutely positioned rather than flexed so bar N starts exactly
            // where stop point N sits on the track, with no cumulative gap drift.
            style={{ left: `${i * width}%`, width: `${width}%` }}
            title={`${formatTick(ticks[i])}–${upper}${unit}: ${count} stocks`}
          >
            <div className={`slider-hist-bar${inRange ? " is-in-range" : ""}`} style={{ height: `${height}%` }} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Dual-thumb slider + min/max inputs for one criterion (values in UI units).
 *
 * Built from pointer events on the rail rather than two stacked native
 * <input type="range"> elements. The native version had three problems this
 * one is designed around:
 *
 *  1. It was driven in whole tick indices (step=1), so the thumb could only
 *     teleport between the 14 stop points — no dragging in between. Here the
 *     drag is continuous in *fractional* tick space and the value is
 *     interpolated inside the segment (see valueAtPosition), with a small
 *     magnet on each stop so round numbers are still easy to land on.
 *  2. A native range thumb travels between half-a-thumb-width insets, while
 *     the tick marks / fill / histogram were laid out across the element's
 *     full width. The two disagreed by up to 8px, so the thumb visibly came
 *     to rest beside the stop point rather than on it. Everything now shares
 *     one inset rail (.dual-range-rail), so a position maps to exactly the
 *     same x for the thumb, the tick, the fill edge and the bar boundary.
 *  3. Only the thumbs were clickable (the inputs had pointer-events:none so
 *     the lower one wasn't swallowed by the upper), and coincident thumbs
 *     could trap each other. The rail now takes the press and moves whichever
 *     thumb is nearer, so clicking the track works and thumbs can't get stuck.
 *
 * Keyboard: arrows move by the current segment's step, Shift+arrow / PageUp /
 * PageDown jump a whole stop point, Home/End go to the extremes.
 */
function RangeControl({ critKey, meta, value, onChange, hist }) {
  const ticks = ticksFor(critKey);
  const lastIdx = ticks.length - 1;
  const lo = ticks[0];
  const hi = ticks[lastIdx];

  const railRef = useRef(null);
  const minThumbRef = useRef(null);
  const maxThumbRef = useRef(null);
  const [dragging, setDragging] = useState(null); // "min" | "max" | null

  const minVal = value.min ?? lo;
  const maxVal = value.max ?? hi;
  const minPos = positionOf(critKey, minVal, 0);
  const maxPos = positionOf(critKey, maxVal, lastIdx);
  const pct = (p) => (p / lastIdx) * 100;

  const labelled = labelledTickIndices(critKey);

  /** Pointer x → fractional tick index along the rail. */
  function positionFromClientX(clientX) {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect?.width) return 0;
    const frac = (clientX - rect.left) / rect.width;
    return Math.min(Math.max(frac, 0), 1) * lastIdx;
  }

  /** Write one thumb, keeping min <= max (they clamp instead of crossing). */
  function apply(handle, next) {
    if (handle === "min") onChange({ ...value, min: Math.min(next, maxVal) });
    else onChange({ ...value, max: Math.max(next, minVal) });
  }

  function handlePointerDown(e) {
    if (e.button != null && e.button !== 0) return;
    const pos = positionFromClientX(e.clientX);
    // Outside the selection the choice is unambiguous; inside it (including
    // when both thumbs sit on the same spot) take the nearer one.
    const handle =
      pos < minPos ? "min" : pos > maxPos ? "max" : Math.abs(pos - minPos) <= Math.abs(pos - maxPos) ? "min" : "max";
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(handle);
    apply(handle, valueAtPosition(critKey, pos));
    (handle === "min" ? minThumbRef : maxThumbRef).current?.focus?.({ preventScroll: true });
  }

  function handlePointerMove(e) {
    if (!dragging) return;
    e.preventDefault();
    apply(dragging, valueAtPosition(critKey, positionFromClientX(e.clientX)));
  }

  function endDrag(e) {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDragging(null);
  }

  function keyHandler(handle) {
    return (e) => {
      const current = handle === "min" ? minVal : maxVal;
      let next;
      switch (e.key) {
        case "ArrowLeft":
        case "ArrowDown":
          next = nudgeValue(critKey, current, -1, { wholeStop: e.shiftKey });
          break;
        case "ArrowRight":
        case "ArrowUp":
          next = nudgeValue(critKey, current, 1, { wholeStop: e.shiftKey });
          break;
        case "PageDown":
          next = nudgeValue(critKey, current, -1, { wholeStop: true });
          break;
        case "PageUp":
          next = nudgeValue(critKey, current, 1, { wholeStop: true });
          break;
        case "Home":
          next = lo;
          break;
        case "End":
          next = hi;
          break;
        default:
          return;
      }
      e.preventDefault();
      apply(handle, next);
    };
  }

  function thumbProps(handle) {
    const current = handle === "min" ? minVal : maxVal;
    const pos = handle === "min" ? minPos : maxPos;
    return {
      className: `dual-range-thumb${dragging === handle ? " is-dragging" : ""}`,
      style: { left: `${pct(pos)}%` },
      role: "slider",
      tabIndex: 0,
      "aria-label": `${meta.label} ${handle === "min" ? "minimum" : "maximum"}`,
      "aria-valuemin": lo,
      "aria-valuemax": hi,
      "aria-valuenow": current,
      "aria-valuetext": `${formatUiValue(current)}${meta.unit}`,
      onKeyDown: keyHandler(handle),
    };
  }

  return (
    <div className="range-control">
      {/* Only reserve the space above the track when there are actually bars to
          put there, so a failed/empty distribution collapses back to a plain
          slider rather than leaving a gap. */}
      <div className={`dual-range${hist?.max ? " has-hist" : ""}`}>
        {/* The rail is inset by half a thumb on each side: it is the exact
            span the thumb centres travel, so every percentage below lines up. */}
        <div
          className="dual-range-rail"
          ref={railRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <SliderHistogram
            counts={hist?.counts}
            max={hist?.max}
            ticks={ticks}
            unit={meta.unit}
            loMin={minVal}
            loMax={maxVal}
          />
          <div className="dual-range-track" />
          <div
            className="dual-range-fill"
            style={{ left: `${pct(minPos)}%`, width: `${Math.max(0, pct(maxPos) - pct(minPos))}%` }}
          />
          <div className="dual-range-ticks">
            {ticks.map((t, i) => (
              <span
                key={i}
                className={`dual-range-tick${i >= minPos - 1e-6 && i <= maxPos + 1e-6 ? " is-active" : ""}`}
                style={{ left: `${pct(i)}%` }}
              />
            ))}
          </div>
          <div ref={minThumbRef} {...thumbProps("min")}>
            <span className="dual-range-bubble">
              {formatUiValue(minVal)}
              {meta.unit}
            </span>
          </div>
          <div ref={maxThumbRef} {...thumbProps("max")}>
            <span className="dual-range-bubble">
              {formatUiValue(maxVal)}
              {meta.unit}
            </span>
          </div>
        </div>
      </div>
      <div className="dual-range-scale">
        {labelled.map((i) => (
          <span key={i} className="dual-range-scale-label" style={{ left: `${pct(i)}%` }}>
            {formatTick(ticks[i])}
            {i === lastIdx ? "+" : ""}
          </span>
        ))}
      </div>
      <div className="range-bounds">
        <span>
          {formatTick(lo)}
          {meta.unit}
          {minPos <= 0 ? " (no min)" : ""}
        </span>
        {/* Live count for this slider: how many of the candidates that pass
            the rest of the screen are inside this criterion's own range. It
            moves as you drag, which the old "stocks in this view" total
            (deliberately blind to this slider) never did. */}
        <span className="range-bounds-mid">
          {hist?.shown != null ? `${hist.selected ?? 0} of ${hist.shown} stocks in range` : ""}
        </span>
        <span>
          {formatTick(hi)}
          {meta.unit}+{maxPos >= lastIdx ? " (no max)" : ""}
        </span>
      </div>
    </div>
  );
}

function FilterRow({ critKey, state, onChange, hist }) {
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
          {/* Typed values are only clamped on blur — clamping on every
              keystroke would rewrite "1" into the max while you were still
              typing "15". */}
          <input
            type="number"
            className="range-input"
            placeholder="min"
            step={meta.slider.step}
            value={state.min ?? ""}
            disabled={!enabled}
            onChange={(e) => set({ min: e.target.value === "" ? null : Number(e.target.value) })}
            onBlur={() => {
              const min = clampToRange(critKey, state.min);
              set({ min: min != null && state.max != null ? Math.min(min, state.max) : min });
            }}
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
            onBlur={() => {
              const max = clampToRange(critKey, state.max);
              set({ max: max != null && state.min != null ? Math.max(max, state.min) : max });
            }}
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
          critKey={critKey}
          meta={meta}
          value={{ min: state.min, max: state.max }}
          onChange={(v) => set({ min: v.min, max: v.max })}
          hist={hist}
        />
      )}
    </div>
  );
}

function FilterSection({ title, keys, values, onChange, histograms }) {
  const [open, setOpen] = useState(true);
  const activeCount = keys.filter((k) => values[k].enabled).length;

  return (
    <div className="card filter-section">
      <button type="button" className="filter-section-head" onClick={() => setOpen((o) => !o)}>
        {/* --color-text, not --color-dark-menu: the latter is a fixed near-black
            (it's the sidebar's background) and stayed unreadable in dark mode. */}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--color-text)" }}>
          <span style={{ color: "var(--color-clickable)", display: "inline-flex" }}>{SECTION_ICONS[title]}</span>
          {title}
          <span className={`chip ${activeCount ? "chip-good" : ""}`} style={{ fontSize: 11 }}>
            {activeCount} of {keys.length} active
          </span>
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open &&
        keys.map((k) => (
          <FilterRow key={k} critKey={k} state={values[k]} onChange={(s) => onChange(k, s)} hist={histograms?.[k]} />
        ))}
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
  const { user } = useAuth();
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

  // Universe sample backing the slider histograms. Refetched only when the
  // universe itself changes (exchanges / excluded sectors / min age) — the
  // per-criterion ranges are cross-filtered locally, which is what keeps the
  // bars responsive while dragging. Server-side cached, so this is cheap.
  const [distribution, setDistribution] = useState(null);
  const [distError, setDistError] = useState(false);

  // Saving a screen from here stores the criteria as they stand in this
  // editor, which is not necessarily what last ran - that's the point: you can
  // build a screen, keep it, and apply it separately (or not at all).
  const [saveOpen, setSaveOpen] = useState(false);
  const [screenName, setScreenName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const sectorsKey = localSectors.join(",");
  const exchangesKey = localExchanges.join(",");

  useEffect(() => {
    let cancelled = false;
    setDistError(false);
    getDistribution({
      exchanges: localExchanges,
      excludeSectors: localSectors,
      minCompanyAgeYears: Number(localMinAge) || 0,
    })
      .then((data) => {
        if (!cancelled) setDistribution(data);
      })
      .catch(() => {
        // Histograms are decoration — a failure (offline, not logged in, empty
        // DB) should leave the sliders fully usable, just without bars.
        if (!cancelled) {
          setDistribution(null);
          setDistError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [exchangesKey, sectorsKey, localMinAge]); // eslint-disable-line react-hooks/exhaustive-deps

  const { byKey: histograms, matching, total } = useMemo(
    () => buildHistograms(distribution, values),
    [distribution, values]
  );

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

  async function handleSaveScreen(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const { scope } = await persistScreen(screenName, buildCriteria(), { user });
      setSaveMsg(
        scope === "account"
          ? `Saved "${screenName.trim()}" to your account.`
          : `Saved "${screenName.trim()}" in this browser. Log in to sync screens to your account.`
      );
      setScreenName("");
      setSaveOpen(false);
    } catch (err) {
      setSaveError(err.message || "Could not save this screen.");
    } finally {
      setSaving(false);
    }
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
          {total > 0 && (
            <span className="chip" title="Live estimate from the sampled universe — press Apply to run the real screen.">
              ~{matching} of {total} match
            </span>
          )}
          <span className="chip chip-good">Filters active: {activeCount}</span>
          <button className="btn btn-ghost" onClick={handleReset}>
            <RotateCcw size={13} />
            Reset
          </button>
        </div>
      </div>

      {distError && (
        <div className="notice notice-muted" style={{ marginBottom: 14 }}>
          Couldn't load the criteria distribution, so the sliders are showing without their histograms. The filters
          themselves still work.
        </div>
      )}

      {SECTIONS.map((s) => (
        <FilterSection
          key={s}
          title={s}
          keys={sectionKeys[s]}
          values={values}
          onChange={(k, st) => setValues((prev) => ({ ...prev, [k]: st }))}
          histograms={histograms}
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

      {/* Apply / save bar */}
      <div className="card card-pad filter-apply-bar">
        {saveOpen && (
          <form className="filter-save-row" onSubmit={handleSaveScreen}>
            <label htmlFor="new-screen-name">Screen name</label>
            <input
              id="new-screen-name"
              className="range-input filter-save-input"
              value={screenName}
              onChange={(e) => setScreenName(e.target.value)}
              placeholder="e.g. Large-cap value"
              autoFocus
            />
            <button type="submit" className="btn btn-primary" disabled={saving || !screenName.trim() || activeCount === 0}>
              {saving ? "Saving…" : "Save screen"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSaveOpen(false);
                setSaveError(null);
              }}
            >
              Discard
            </button>
            <span className="page-subtitle">
              {activeCount === 0
                ? "Turn on at least one criterion first."
                : user
                ? "Saved to your account, ready to reuse from Saved Screens."
                : "Not logged in — this will be kept in this browser only."}
            </span>
          </form>
        )}

        {saveError && <div className="notice notice-error filter-apply-notice">{saveError}</div>}

        {saveMsg && (
          <p className="page-subtitle filter-apply-notice">
            {saveMsg} <Link to="/saved">View saved screens</Link>
          </p>
        )}

        <div className="filter-apply-row">
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
            <button
              className="btn btn-secondary"
              onClick={() => {
                setSaveMsg(null);
                setSaveError(null);
                setSaveOpen((open) => !open);
              }}
              disabled={activeCount === 0}
              title={activeCount === 0 ? "Turn on at least one criterion first" : "Keep these filters as a saved screen"}
            >
              <Bookmark size={14} />
              Save as Screen
            </button>
            <button className="btn btn-primary" onClick={handleApply} disabled={loading}>
              <Play size={14} />
              {loading ? "Running…" : "Apply Filters"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
