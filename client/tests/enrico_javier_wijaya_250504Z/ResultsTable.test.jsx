import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ResultsTable from "../../src/components/ResultsTable";

// Two sample result rows in the ScreenerResultRow shape. Values are raw API
// units (market cap in dollars, P/E as a plain number); ResultsTable formats
// them via screener/criteria.js.
const rows = [
  {
    exchangeCode: "SGX",
    stockCode: "D05",
    stockName: "DBS Group Holdings",
    values: { marketCap: 95000000000, peRatio: 9.8 },
    score: 87,
  },
  {
    exchangeCode: "NASDAQ",
    stockCode: "AAPL",
    stockName: "Apple Inc",
    values: { marketCap: 3000000000000, peRatio: 30 },
    score: 55,
  },
];

describe("ResultsTable", () => {
  it("renders one row per stock with identity and formatted criteria columns", () => {
    render(<ResultsTable rows={rows} />);

    // Identity columns
    expect(screen.getByText("DBS Group Holdings")).toBeInTheDocument();
    expect(screen.getByText("Apple Inc")).toBeInTheDocument();
    expect(screen.getByText("D05")).toBeInTheDocument();
    expect(screen.getByText("AAPL")).toBeInTheDocument();

    // Criteria column headers come from labelFor()
    expect(screen.getByRole("columnheader", { name: "Market Cap" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "P/E Ratio" })).toBeInTheDocument();

    // Formatted values come from formatValue(): $95.0B, 9.8x, etc.
    expect(screen.getByText("$95.0B")).toBeInTheDocument();
    expect(screen.getByText("9.8×")).toBeInTheDocument();
  });

  it("shows a Score column only when rows carry a score", () => {
    render(<ResultsTable rows={rows} />);
    expect(screen.getByRole("columnheader", { name: "Score" })).toBeInTheDocument();
    expect(screen.getByText("87")).toBeInTheDocument();
  });

  it("shows the empty-state message when there are no rows", () => {
    render(<ResultsTable rows={[]} emptyMessage="Nothing to show" />);
    expect(screen.getByText("Nothing to show")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("calls onRowClick with the clicked row", () => {
    const onRowClick = vi.fn();
    render(<ResultsTable rows={rows} onRowClick={onRowClick} />);

    fireEvent.click(screen.getByRole("button", { name: "View DBS Group Holdings" }));

    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it("makes clickable rows keyboard-accessible (focusable + Enter/Space)", () => {
    const onRowClick = vi.fn();
    render(<ResultsTable rows={rows} onRowClick={onRowClick} />);

    const row = screen.getByRole("button", { name: "View Apple Inc" });
    expect(row).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    expect(onRowClick).toHaveBeenCalledTimes(2);
    expect(onRowClick).toHaveBeenLastCalledWith(rows[1]);
  });

  it("does not expose rows as buttons when not clickable", () => {
    render(<ResultsTable rows={rows} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("paginates client-side and disables the pager at the ends", () => {
    render(<ResultsTable rows={rows} pageSize={1} />);

    // Page 1 shows the first stock only.
    expect(screen.getByText("DBS Group Holdings")).toBeInTheDocument();
    expect(screen.queryByText("Apple Inc")).not.toBeInTheDocument();
    expect(screen.getByText("Page 1 / 2")).toBeInTheDocument();

    const prev = screen.getByRole("button", { name: "Previous" });
    const next = screen.getByRole("button", { name: "Next" });
    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();

    fireEvent.click(next);

    // Page 2 shows the second stock, and Next is now disabled.
    expect(screen.getByText("Apple Inc")).toBeInTheDocument();
    expect(screen.queryByText("DBS Group Holdings")).not.toBeInTheDocument();
    expect(screen.getByText("Page 2 / 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("renders selection checkboxes and reports toggles when selectable", () => {
    const onToggleRow = vi.fn();
    render(
      <ResultsTable
        rows={rows}
        selectable
        selectedKeys={new Set(["SGX-D05"])}
        onToggleRow={onToggleRow}
      />
    );

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    // The pre-selected row (SGX-D05) is checked.
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();

    fireEvent.click(checkboxes[1]);
    expect(onToggleRow).toHaveBeenCalledWith(rows[1]);
  });
});