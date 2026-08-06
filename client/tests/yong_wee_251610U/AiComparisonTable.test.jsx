/**
 * Owner: Yong Wee (Person 1) - Auth + AI Recommendation.
 * Unit tests for AiComparisonTable - the head-to-head comparison grid shown
 * for 2+ shortlisted stocks (mode: "comparison" from POST /api/ai/analyze).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AiComparisonTable from "../../src/components/AiComparisonTable";

const comparison = {
  stocks: ["DBS Group Holdings", "OCBC Bank"],
  criteria: [
    {
      name: "Growth outlook",
      notes: ["Steady loan growth.", "Modest but stable growth."],
      winner: "DBS Group Holdings",
    },
    {
      name: "Dividend stability",
      notes: ["High, consistent payout.", "Tie"],
      winner: "Tie",
    },
  ],
  summary: "DBS edges ahead on growth momentum.",
  disclaimer: "This is not financial advice.",
};

describe("AiComparisonTable", () => {
  it("renders one column per stock and one row per criterion", () => {
    render(<AiComparisonTable comparison={comparison} />);

    expect(screen.getByRole("columnheader", { name: "DBS Group Holdings" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "OCBC Bank" })).toBeInTheDocument();
    expect(screen.getByText("Growth outlook")).toBeInTheDocument();
    expect(screen.getByText("Dividend stability")).toBeInTheDocument();
    expect(screen.getByText("Steady loan growth.")).toBeInTheDocument();
    expect(screen.getByText("Modest but stable growth.")).toBeInTheDocument();
  });

  it("highlights the winning stock's cell for each criterion", () => {
    render(<AiComparisonTable comparison={comparison} />);

    const winningCell = screen.getByText("Steady loan growth.");
    expect(winningCell).toHaveClass("ai-comparison-winner");

    const losingCell = screen.getByText("Modest but stable growth.");
    expect(losingCell).not.toHaveClass("ai-comparison-winner");
  });

  it("does not highlight any cell for a criterion the model called a Tie", () => {
    render(<AiComparisonTable comparison={comparison} />);

    expect(screen.getByText("High, consistent payout.")).not.toHaveClass("ai-comparison-winner");
  });

  it("renders the summary and disclaimer text when present", () => {
    render(<AiComparisonTable comparison={comparison} />);

    expect(screen.getByText("DBS edges ahead on growth momentum.")).toBeInTheDocument();
    expect(screen.getByText("This is not financial advice.")).toBeInTheDocument();
  });

  it("falls back to an em dash when a stock is missing a note for a criterion", () => {
    const sparse = {
      stocks: ["DBS Group Holdings", "OCBC Bank"],
      criteria: [{ name: "Valuation", notes: ["Fairly valued."], winner: "DBS Group Holdings" }],
    };
    render(<AiComparisonTable comparison={sparse} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders nothing when there are no stocks or no criteria", () => {
    const { container: emptyStocks } = render(<AiComparisonTable comparison={{ stocks: [], criteria: [{}] }} />);
    expect(emptyStocks).toBeEmptyDOMElement();

    const { container: emptyCriteria } = render(<AiComparisonTable comparison={{ stocks: ["DBS"], criteria: [] }} />);
    expect(emptyCriteria).toBeEmptyDOMElement();
  });
});
