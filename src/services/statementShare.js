// Statement PDF export and WhatsApp hand-off (Electron main process).
// WhatsApp cannot receive a file from a link, so: save the PDF, copy the file to the
// Windows clipboard, open the chat, and the owner pastes it with Ctrl+V.
const { app, BrowserWindow, shell } = require("electron");
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const settingsService = require("./settingsService");
const { normalizePhone, whatsappLinks, safeFileName } = require("./whatsapp");

function statementsDir() {
  const dir = path.join(app.getPath("documents"), "LaptopInventoryManager", "Statements");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Renders trusted-but-untouched HTML with scripts off; a temp file avoids data-URL size limits.
async function htmlToPdf(html, outPath) {
  const tmp = path.join(os.tmpdir(), `statement-${Date.now()}.html`);
  fs.writeFileSync(tmp, html, "utf8");
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } });
  try {
    await win.loadFile(tmp);
    const pdf = await win.webContents.printToPDF({ pageSize: "A4", printBackground: true });
    fs.writeFileSync(outPath, pdf);
  } finally {
    win.destroy();
    fs.rmSync(tmp, { force: true });
  }
}

function copyFileToClipboard(filePath) {
  return new Promise((resolve) => {
    const literal = filePath.replace(/'/g, "''");
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", `Set-Clipboard -LiteralPath '${literal}'`],
      { windowsHide: true, timeout: 10000 },
      (err) => resolve(!err),
    );
  });
}

// { html, customerName, phone, message } -> { pdfPath, clipboardOk, chat: 'app'|'web'|'none' }
async function exportAndShare({ html, customerName, phone, message }) {
  if (!html || typeof html !== "string") throw new Error("Nothing to export");
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const pdfPath = path.join(statementsDir(), `${safeFileName(customerName)}-${stamp}.pdf`);
  await htmlToPdf(html, pdfPath);

  const clipboardOk = await copyFileToClipboard(pdfPath);

  const normalized = normalizePhone(phone, settingsService.getSetting("default_country_code") || "92");
  let chat = "none";
  if (normalized) {
    const [appLink, webLink] = whatsappLinks(normalized, message || "");
    const hasDesktopApp = !!app.getApplicationNameForProtocol("whatsapp://");
    await shell.openExternal(hasDesktopApp ? appLink : webLink);
    chat = hasDesktopApp ? "app" : "web";
  }
  if (!clipboardOk || chat === "none") shell.showItemInFolder(pdfPath);
  return { pdfPath, clipboardOk, chat };
}

// Automatic path: PDF -> the linked WhatsApp, no clicks. Throws errors that carry a .code.
async function autoSend({ html, customerName, phone, message }) {
  if (!html || typeof html !== "string") throw new Error("Nothing to export");
  const link = require("./whatsappLink").getLink();
  if (link.getStatus().state !== "linked") throw require("./whatsappLink").coded("NOT_LINKED", "WhatsApp is not linked. Link it first.");
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const pdfPath = path.join(statementsDir(), `${safeFileName(customerName)}-${stamp}.pdf`);
  await htmlToPdf(html, pdfPath);
  await link.sendPdf({ phone, filePath: pdfPath, fileName: `${safeFileName(customerName)}.pdf`, caption: message });
  return { pdfPath };
}

module.exports = { exportAndShare, autoSend };
