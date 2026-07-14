import PDFDocument from "pdfkit";

/**
 * Owner: Person 2 (Charles) - Admin Dashboard.
 *
 * Builds the "Export summary PDF" report (see admin.controller.js's
 * exportSummaryPdf()) - a branded one-shot document combining the same
 * stats shown on the Admin dashboard cards with a full user table.
 * Colors/fonts loosely mirror client/src/theme.js's design tokens (can't
 * import that file server-side - it's a client-only module - so the hex
 * values are duplicated here; keep the two in sync if the palette changes).
 *
 * Uses pdfkit directly rather than a headless-browser/HTML-to-PDF approach
 * (e.g. Puppeteer) - pdfkit is pure JS with no native binary/Chromium
 * download, which matters given this project already hit a native-binary
 * Docker crash once before (Rollup) - not worth risking a repeat for a
 * report page.
 */

const COLORS = {
  darkMenu: "#0A1628",
  lightBackground: "#F4F7FC",
  clickable: "#1A5C9E",
  goodNumber: "#00A86B",
  badNumber: "#D16B6B",
  mutedText: "#4A5568",
  headerAccent: "#C9D6E8",
};

const PAGE_MARGIN = 50;
const TABLE_COLUMNS = [
  { key: "name", label: "Name", width: 95 },
  { key: "email", label: "Email", width: 150 },
  { key: "statusDisplay", label: "Status", width: 60 },
  { key: "roleDisplay", label: "Role", width: 50 },
  { key: "totalPaidDisplay", label: "Total Paid", width: 90 },
  { key: "joinedDisplay", label: "Joined", width: 55 },
];

function centsToDisplay(cents) {
  return (Number(cents) / 100).toFixed(2);
}

function fmtDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function drawHeader(doc, generatedAt) {
  doc.rect(0, 0, doc.page.width, 90).fill(COLORS.darkMenu);
  doc.fillColor("#ffffff").fontSize(20).font("Helvetica-Bold").text("Stock Screener", PAGE_MARGIN, 30);
  doc.fillColor(COLORS.headerAccent).fontSize(11).font("Helvetica").text("Admin Summary Report", PAGE_MARGIN, 55);
  doc.fillColor(COLORS.headerAccent).fontSize(9).text(`Generated ${generatedAt.toLocaleString()}`, PAGE_MARGIN, 70);
}

function drawStatCards(doc, stats, currency) {
  const y = 120;
  const usableWidth = doc.page.width - PAGE_MARGIN * 2;
  const gap = 12;
  const cardWidth = (usableWidth - gap * 3) / 4;

  const cards = [
    { label: "Total Users", value: String(stats.totalUsers), color: COLORS.darkMenu },
    { label: "Active", value: String(stats.activeUsers), color: COLORS.goodNumber },
    { label: "Inactive", value: String(stats.inactiveUsers), color: COLORS.badNumber },
    { label: "Revenue", value: `${currency} ${centsToDisplay(stats.totalRevenueCents)}`, color: COLORS.clickable },
  ];

  cards.forEach((card, i) => {
    const x = PAGE_MARGIN + i * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, 60, 6).fill(COLORS.lightBackground);
    doc.fillColor(COLORS.mutedText).fontSize(8).font("Helvetica").text(card.label.toUpperCase(), x + 10, y + 10);
    doc.fillColor(card.color).fontSize(16).font("Helvetica-Bold").text(card.value, x + 10, y + 26, {
      width: cardWidth - 20,
      ellipsis: true,
    });
  });

  return y + 60 + 20;
}

/**
 * Draws the table header row and returns the y-coordinate just below it -
 * called once at the top of the table, and again after every page break so
 * a continued table still shows its column labels.
 */
function drawTableHeader(doc, y) {
  const tableWidth = doc.page.width - PAGE_MARGIN * 2;
  doc.rect(PAGE_MARGIN, y, tableWidth, 20).fill(COLORS.darkMenu);
  doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold");
  let x = PAGE_MARGIN;
  for (const col of TABLE_COLUMNS) {
    doc.text(col.label, x + 4, y + 6, { width: col.width - 8 });
    x += col.width;
  }
  return y + 20;
}

function drawUsersTable(doc, users, startY) {
  const rowHeight = 18;
  const bottomLimit = doc.page.height - PAGE_MARGIN;

  doc.fillColor(COLORS.darkMenu).fontSize(13).font("Helvetica-Bold").text("Users", PAGE_MARGIN, startY);
  let y = startY + 22;
  y = drawTableHeader(doc, y);
  doc.font("Helvetica").fontSize(8);

  users.forEach((row, idx) => {
    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      y = drawTableHeader(doc, PAGE_MARGIN);
      doc.font("Helvetica").fontSize(8);
    }
    if (idx % 2 === 0) {
      doc.rect(PAGE_MARGIN, y, doc.page.width - PAGE_MARGIN * 2, rowHeight).fill(COLORS.lightBackground);
    }
    let x = PAGE_MARGIN;
    doc.fillColor(COLORS.darkMenu);
    for (const col of TABLE_COLUMNS) {
      doc.text(String(row[col.key] ?? ""), x + 4, y + 5, { width: col.width - 8, ellipsis: true });
      x += col.width;
    }
    y += rowHeight;
  });

  return y;
}

/**
 * @param {{ stats: object, users: Array<object>, currency?: string }} params
 * @returns {Promise<Buffer>}
 */
export function buildAdminSummaryPdf({ stats, users, currency = "SGD" }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawHeader(doc, new Date());
    const afterCardsY = drawStatCards(doc, stats, currency);

    const rows = users.map((u) => ({
      ...u,
      statusDisplay: u.isActive ? "Active" : "Inactive",
      roleDisplay: u.isAdmin ? "Admin" : "User",
      totalPaidDisplay: `${currency} ${centsToDisplay(u.totalPaidCents ?? 0)}`,
      joinedDisplay: fmtDate(u.createdAt),
    }));
    drawUsersTable(doc, rows, afterCardsY);

    doc.end();
  });
}
