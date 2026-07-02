/**
 * Owner: Person 3 (Jorel) - Screener / Filter Engine (filter UI),
 * with results rendering shared with Person 4 (Dashboard component below).
 *
 * TODO:
 *  - Render one input (range: min/max) per CriteriaRange from shared/types.
 *  - POST the selections to /api/screener/run (ScreenerRequest -> ScreenerResponse).
 *  - Pass the response into <ResultsTable /> (see components/ResultsTable.jsx).
 */
import ResultsTable from "../components/ResultsTable";

export default function Screener() {
  return (
    <section>
      <h1>Stock Screener</h1>
      <p>Owner: Person 3 (filters) + Person 4 (results table below).</p>
      {/* TODO: filter form goes here, calling POST /api/screener/run */}
      <ResultsTable rows={[]} />
    </section>
  );
}
