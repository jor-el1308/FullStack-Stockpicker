import { useParams } from "react-router-dom";

/**
 * Owner: Person 4 (Enrico) - Dashboard & Stock Report Page.
 * TODO: fetch GET /api/stocks/:exchangeCode/:stockCode and
 * /api/stocks/:exchangeCode/:stockCode/prices, render closing price graph
 * and 52-week high/low (StockDetail typedef in shared/types/index.js).
 */
export default function StockDetail() {
  const { exchangeCode, stockCode } = useParams();
  return (
    <section>
      <h1 className="numeric">
        {exchangeCode}:{stockCode}
      </h1>
      <p>Owner: Person 4. Render price graph + 52-week high/low here.</p>
    </section>
  );
}
