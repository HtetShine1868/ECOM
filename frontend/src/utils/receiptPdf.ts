import { jsPDF } from "jspdf";
import type { Order } from "../types";
import { formatDate, formatMMK, formatStatus } from "./format";

const PAGE_W = 1240;
const PAD = 72;
const INK = "#1c1917";
const MUTED = "#78716c";
const LINE = "#e7e5e4";
const ACCENT = "#8f3d28";
const PAPER = "#fffdf8";

function money(value: number | string | null | undefined) {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  return formatMMK(Number.isFinite(amount) ? amount : 0);
}

function wrap(ctx: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  const source = value.trim() || "—";
  const lines: string[] = [];
  let current = "";

  const push = (chunk: string) => {
    if (ctx.measureText(chunk).width <= maxWidth) {
      lines.push(chunk);
      return;
    }
    let piece = "";
    for (const char of chunk) {
      const next = piece + char;
      if (piece && ctx.measureText(next).width > maxWidth) {
        lines.push(piece);
        piece = char;
      } else {
        piece = next;
      }
    }
    if (piece) lines.push(piece);
  };

  for (const word of source.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(next).width > maxWidth) {
      push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) push(current);
  return lines.length > 0 ? lines : ["—"];
}

function drawReceipt(order: Order): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the receipt.");

  const contentWidth = PAGE_W - PAD * 2;
  const nameWidth = 620;
  ctx.font = "600 26px 'Nunito Sans', 'Myanmar Text', 'Segoe UI', sans-serif";

  const items = order.items ?? [];
  const itemLines = items.map((item) => wrap(ctx, item.productName, nameWidth));
  const addressLines = wrap(ctx, order.deliveryAddress || "—", contentWidth);

  const rowHeight = (lines: number) => Math.max(44, lines * 34 + 16);
  const itemsHeight = itemLines.reduce((sum, lines) => sum + rowHeight(lines.length), 0);
  const height = 2000 + addressLines.length * 48 + itemsHeight;

  canvas.width = PAGE_W;
  canvas.height = height;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, PAGE_W, height);
  ctx.textBaseline = "top";

  let y = 64;
  ctx.fillStyle = ACCENT;
  ctx.font = "650 54px Fraunces, Georgia, serif";
  ctx.fillText("ShopNow", PAD, y);
  y += 68;

  ctx.fillStyle = MUTED;
  ctx.font = "700 20px 'Nunito Sans', 'Segoe UI', sans-serif";
  ctx.fillText("OFFICIAL RECEIPT", PAD, y);
  y += 40;

  rule(ctx, y);
  y += 28;

  ctx.fillStyle = INK;
  ctx.font = "700 32px 'Nunito Sans', 'Segoe UI', sans-serif";
  ctx.fillText(`Order #${order.id}`, PAD, y);
  ctx.fillStyle = ACCENT;
  ctx.font = "700 24px 'Nunito Sans', 'Segoe UI', sans-serif";
  const status = formatStatus(order.status);
  ctx.fillText(status, PAGE_W - PAD - ctx.measureText(status).width, y + 4);
  y += 44;

  ctx.fillStyle = MUTED;
  ctx.font = "400 24px 'Nunito Sans', 'Segoe UI', sans-serif";
  ctx.fillText(formatDate(order.orderDate), PAD, y);
  y += 48;

  ctx.fillStyle = INK;
  ctx.font = "700 22px 'Nunito Sans', 'Segoe UI', sans-serif";
  ctx.fillText("Deliver to", PAD, y);
  y += 34;
  ctx.font = "600 28px 'Nunito Sans', 'Myanmar Text', 'Segoe UI', sans-serif";
  ctx.fillText(order.customerName || "—", PAD, y);
  y += 38;
  ctx.fillStyle = MUTED;
  ctx.font = "400 24px 'Nunito Sans', 'Myanmar Text', 'Segoe UI', sans-serif";
  if (order.customerPhone) {
    ctx.fillText(order.customerPhone, PAD, y);
    y += 32;
  }
  if (order.customerEmail) {
    ctx.fillText(order.customerEmail, PAD, y);
    y += 32;
  }
  for (const line of addressLines) {
    ctx.fillText(line, PAD, y);
    y += 32;
  }
  if (order.townName) {
    ctx.fillText(order.townName, PAD, y);
    y += 32;
  }
  y += 20;

  rule(ctx, y);
  y += 22;

  ctx.fillStyle = MUTED;
  ctx.font = "700 18px 'Nunito Sans', 'Segoe UI', sans-serif";
  ctx.fillText("ITEM", PAD, y);
  ctx.fillText("QTY", PAD + 680, y);
  rightText(ctx, "PRICE", PAD + 900, y);
  rightText(ctx, "AMOUNT", PAGE_W - PAD, y);
  y += 36;

  items.forEach((item, index) => {
    const lines = itemLines[index];
    const h = rowHeight(lines.length);
    ctx.fillStyle = INK;
    ctx.font = "600 26px 'Nunito Sans', 'Myanmar Text', 'Segoe UI', sans-serif";
    lines.forEach((line, lineIndex) => {
      ctx.fillText(line, PAD, y + lineIndex * 34);
    });
    ctx.font = "400 24px 'Nunito Sans', 'Segoe UI', sans-serif";
    ctx.fillStyle = MUTED;
    ctx.fillText(String(item.quantity), PAD + 680, y);
    rightText(ctx, money(item.unitPrice), PAD + 900, y);
    ctx.fillStyle = INK;
    ctx.font = "600 24px 'Nunito Sans', 'Segoe UI', sans-serif";
    rightText(ctx, money(item.lineTotal), PAGE_W - PAD, y);
    y += h;
  });

  y += 8;
  rule(ctx, y);
  y += 22;

  totalRow(ctx, "Products", money(order.subtotal), y, false);
  y += 40;
  totalRow(ctx, "Delivery", money(order.cargoTotal), y, false);
  y += 48;
  ctx.fillStyle = LINE;
  ctx.fillRect(PAD, y, contentWidth, 2);
  y += 18;
  totalRow(ctx, "Total", money(order.total), y, true);
  y += 72;

  ctx.fillStyle = MUTED;
  ctx.font = "400 22px 'Nunito Sans', 'Segoe UI', sans-serif";
  ctx.fillText("Thank you for shopping at ShopNow.", PAD, y);

  return cropBottom(canvas, y + 64);
}

function cropBottom(source: HTMLCanvasElement, usedHeight: number): HTMLCanvasElement {
  const height = Math.min(source.height, Math.max(usedHeight, 1));
  if (height === source.height) return source;
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0);
  return out;
}

function rule(ctx: CanvasRenderingContext2D, y: number) {
  ctx.fillStyle = LINE;
  ctx.fillRect(PAD, y, PAGE_W - PAD * 2, 2);
}

function rightText(ctx: CanvasRenderingContext2D, value: string, x: number, y: number) {
  ctx.fillText(value, x - ctx.measureText(value).width, y);
}

function totalRow(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  y: number,
  strong: boolean,
) {
  ctx.fillStyle = strong ? INK : MUTED;
  ctx.font = strong
    ? "700 32px 'Nunito Sans', 'Segoe UI', sans-serif"
    : "400 24px 'Nunito Sans', 'Segoe UI', sans-serif";
  ctx.fillText(label, PAD, y);
  ctx.fillStyle = strong ? ACCENT : INK;
  rightText(ctx, value, PAGE_W - PAD, y);
}

function canvasToPdf(canvas: HTMLCanvasElement) {
  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 28;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;
  const ratio = usableWidth / canvas.width;
  const sliceHeight = Math.max(1, Math.floor(usableHeight / ratio));

  let offset = 0;
  let page = 0;
  while (offset < canvas.height) {
    const height = Math.min(sliceHeight, canvas.height - offset);
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = height;
    const ctx = slice.getContext("2d");
    if (!ctx) throw new Error("Could not build the PDF.");
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, offset, canvas.width, height, 0, 0, canvas.width, height);
    if (page > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, usableWidth, height * ratio);
    offset += height;
    page += 1;
  }

  return pdf;
}

export async function renderOrderReceipt(order: Order) {
  if (document.fonts?.ready) await document.fonts.ready;
  return canvasToPdf(drawReceipt(order)).output("blob");
}

export async function downloadOrderReceipt(order: Order) {
  const blob = await renderOrderReceipt(order);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ShopNow-receipt-${order.id}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
