const { getDatabase } = require("../database/dbInit");
const ageing = require("./ageingService");

const DAY = 24 * 60 * 60 * 1000;
const RANK = { bad: 0, warn: 1, info: 2 };
const SHOWN = 8; // how many people or things are listed under one alert (View all opens the rest)

const daysBetween = (from, to) => Math.max(0, Math.round((new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / DAY));

// What needs the owner's eye today. lastBackupAt is passed in (the main process knows where backups live).
class AttentionService {
  // whatsapp: { state, saved, error } and drive: { configured, connected, error } come from the main process
  // (they live outside the database). Leave them out and those two alerts are simply skipped.
  get({ now = new Date(), lastBackupAt = null, costVisible = false, graceDays = 30, whatsapp = null, drive = null } = {}) {
    const db = getDatabase();
    const items = [];
    const setting = (key) => (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) || {}).value;

    // Backup
    if (!lastBackupAt) {
      items.push({ id: "backup", level: "bad", title: "No backup yet", detail: "Create a backup so your data is safe.", page: "backup" });
    } else {
      const days = Math.floor((now - new Date(lastBackupAt)) / DAY);
      if (days >= 2) items.push({ id: "backup", level: "warn", title: "Backup is out of date", detail: `Last backup was ${days} days ago.`, page: "backup" });
    }

    // Customers who owe for too long
    const today = now.toLocaleDateString("sv-SE");
    const late = ageing.overdue({ asOf: today, graceDays });
    if (late.customers > 0) {
      items.push({
        id: "overdue", level: "warn", count: late.customers, amount: late.amount, page: "customers",
        entries: late.list.slice().sort((a, b) => b.oldest_days - a.oldest_days || b.total - a.total).slice(0, SHOWN).map((r) => ({
          label: r.customer_name,
          detail: `Unpaid for ${r.oldest_days} days${r.phone ? " · " + r.phone : ""}`,
          amount: r.total,
          target: { type: "customer", id: r.customer_id },
        })),
        title: `${late.customers} customer${late.customers === 1 ? "" : "s"} overdue`,
        detail: `Unpaid for more than ${graceDays} days.`,
      });
    }

    // Instalments that were due and are still unpaid
    const lateList = require("./instalmentService").overdueList({ asOf: today });
    const lateInstalments = lateList.length;
    if (lateInstalments > 0) {
      items.push({
        id: "instalments", level: "warn", count: lateInstalments, page: "instalments", title: `${lateInstalments} instalment${lateInstalments === 1 ? "" : "s"} overdue`, detail: "Customers have missed a payment date.",
        entries: lateList.slice(0, SHOWN).map((i) => ({
          label: i.customer_name,
          detail: `Part ${i.seq} of ${i.reference_no} was due ${i.due_date} (${daysBetween(i.due_date, today)} days ago)`,
          amount: Math.max(0, (Number(i.amount) || 0) - (Number(i.paid) || 0)),
          target: { type: "instalment", saleId: i.sale_issue_id },
        })),
      });
    }

    // Low stock (only when the owner has set a level in Settings)
    const level = parseInt(setting("low_stock_level"), 10) || 0;
    if (level > 0) {
      const n = db.prepare("SELECT COUNT(*) n FROM products WHERE status = 'In Stock' AND quantity <= ?").get(level).n;
      if (n > 0) {
        const low = db.prepare("SELECT id, product_name, model, quantity FROM products WHERE status = 'In Stock' AND quantity <= ? ORDER BY quantity ASC, product_name LIMIT ?").all(level, SHOWN);
        items.push({
          id: "lowstock", level: "warn", count: n, page: "inventory", title: `${n} item${n === 1 ? "" : "s"} low on stock`, detail: `${level} or fewer left.`,
          entries: low.map((p) => ({
            label: p.product_name,
            detail: `${p.quantity === 0 ? "None" : p.quantity} left${p.model ? " · " + p.model : ""}`,
            target: { type: "product", id: p.id },
          })),
        });
      }
    }

    // Background tasks that did not finish cleanly
    const since = new Date(now - 3 * DAY).toLocaleDateString("sv-SE") + " 00:00:00";
    const failed = db.prepare("SELECT COUNT(*) n FROM jobs WHERE status IN ('failed','partial','interrupted') AND created_at >= ?").get(since).n;
    if (failed > 0) {
      const bad = db.prepare("SELECT id, title, status, error FROM jobs WHERE status IN ('failed','partial','interrupted') AND created_at >= ? ORDER BY id DESC LIMIT ?").all(since, SHOWN);
      items.push({
        id: "tasks", level: "warn", count: failed, action: "tasks", title: `${failed} task${failed === 1 ? "" : "s"} need a look`, detail: "Some background work did not finish. Open Tasks to retry.",
        entries: bad.map((j) => ({
          label: j.title,
          detail: j.error || (j.status === "partial" ? "Finished with some problems" : j.status === "interrupted" ? "Stopped before it finished" : "Failed"),
          target: { type: "task", id: j.id },
        })),
      });
    }

    // Cash or bank below zero (amounts stay hidden until unlocked)
    if (costVisible) {
      const b = require("./dashboardService").getBalances(db);
      if (b.cashInHand < -0.005 || b.bankBalance < -0.005) {
        items.push({ id: "cash", level: "bad", page: "cashbook", title: "Cash or bank is below zero", detail: "Check the opening balances in Settings and recent expenses." });
      }
    }

    // WhatsApp was linked (or just got unlinked) and is not connected right now
    if (whatsapp && whatsapp.state === "unlinked" && (whatsapp.saved || whatsapp.error)) {
      items.push({ id: "whatsapp", level: "warn", page: "settings", title: "WhatsApp is disconnected", detail: whatsapp.error || "Statements and invoices cannot be sent. Open Settings and press Reconnect." });
    }

    // Google Drive: not connected, or connected and the last upload failed
    if (drive) {
      if (drive.connected && drive.error) {
        items.push({ id: "drive-failing", level: "warn", page: "backup", title: `${drive.label || "Online backup"} upload is failing`, detail: drive.error });
      } else if (!drive.connected) {
        items.push({ id: "drive-off", level: "info", page: "backup", title: `${drive.label || "Online"} backup is not connected`, detail: "Backups stay only on this PC. Connect it on the Backup page to keep a copy online." });
      }
    }

    // Suppliers the shop has owed for too long (payments clear the oldest bills first)
    const supplierDays = parseInt(setting("supplier_due_days"), 10) || 30;
    const owed = this._suppliersOverdue(db, today, supplierDays);
    if (owed.length > 0) {
      items.push({
        id: "suppliers", level: "warn", count: owed.length, amount: Math.round(owed.reduce((t, r) => t + r.left, 0) * 100) / 100, page: "suppliers",
        title: `${owed.length} supplier${owed.length === 1 ? "" : "s"} to pay`, detail: `Owed for more than ${supplierDays} days.`,
        entries: owed.slice(0, SHOWN).map((r) => ({ label: r.name, detail: `Owed for ${r.days} days`, amount: r.left, target: { type: "supplier", id: r.id } })),
      });
    }

    // Instalments coming up in the next 7 days (the late ones are the alert above)
    const soon = require("./instalmentService").due({ asOf: today, withinDays: 7 }).filter((i) => i.status === "Due soon");
    if (soon.length > 0) {
      items.push({
        id: "instalments-soon", level: "info", count: soon.length, page: "instalments", title: `${soon.length} instalment${soon.length === 1 ? "" : "s"} due this week`, detail: "Remind these customers before the date.",
        entries: soon.slice(0, SHOWN).map((i) => ({
          label: i.customer_name,
          detail: `Part ${i.seq} of ${i.reference_no} due ${i.due_date} (${daysBetween(today, i.due_date) === 0 ? "today" : "in " + daysBetween(today, i.due_date) + " days"})`,
          amount: Math.max(0, (Number(i.amount) || 0) - (Number(i.paid) || 0)),
          target: { type: "instalment", saleId: i.sale_issue_id },
        })),
      });
    }

    // Repairs that are finished but the customer has not come for them
    const ready = db.prepare("SELECT j.id, j.job_no, j.device, j.ready_date, c.customer_name, c.phone FROM service_jobs j JOIN customers c ON c.id = j.customer_id WHERE j.status = 'Ready' ORDER BY j.ready_date ASC, j.id ASC").all();
    if (ready.length > 0) {
      items.push({
        id: "service-ready", level: "info", count: ready.length, page: "service-jobs", title: `${ready.length} repair${ready.length === 1 ? "" : "s"} ready, not collected`, detail: "Call these customers to collect their devices.",
        entries: ready.slice(0, SHOWN).map((j) => ({
          label: `${j.customer_name} · ${j.device}`,
          detail: `${j.job_no} ready${j.ready_date ? " for " + daysBetween(j.ready_date, today) + " days" : ""}${j.phone ? " · " + j.phone : ""}`,
          target: { type: "servicejob", id: j.id },
        })),
      });
    }

    // Yesterday had cash or bank movement or sales, and the owner never closed the day
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toLocaleDateString("sv-SE");
    if (!db.prepare("SELECT 1 FROM day_closings WHERE closing_date = ?").get(y)) {
      let busy = !!db.prepare("SELECT 1 FROM sale_issues WHERE issue_date = ? LIMIT 1").get(y);
      if (!busy) {
        const t = require("./cashBookService").get({ from: y, to: y }).totals;
        busy = (t.cashIn || 0) + (t.cashOut || 0) + (t.bankIn || 0) + (t.bankOut || 0) > 0.004;
      }
      if (busy) items.push({ id: "day-not-closed", level: "info", page: "cashbook", title: "Yesterday was not closed", detail: `Count the cash for ${y} in the Cash Book and press Close the day.` });
    }

    return items.sort((a, b) => RANK[a.level] - RANK[b.level]);
  }

  // Suppliers with a bill still unpaid after `days`. Payments are applied to the oldest bills first.
  _suppliersOverdue(db, today, days) {
    const rows = db.prepare("SELECT l.supplier_id id, s.name, l.entry_date, l.charge, l.paid FROM supplier_ledger l JOIN suppliers s ON s.id = l.supplier_id ORDER BY l.supplier_id, l.entry_date, l.id").all();
    const by = new Map();
    for (const r of rows) {
      if (!by.has(r.id)) by.set(r.id, { id: r.id, name: r.name, bills: [], paid: 0 });
      const s = by.get(r.id);
      if (r.charge > 0) s.bills.push({ date: r.entry_date, left: r.charge });
      s.paid += r.paid || 0;
    }
    const out = [];
    for (const s of by.values()) {
      let pay = s.paid;
      for (const b of s.bills) { const used = Math.min(b.left, pay); b.left -= used; pay -= used; }
      const old = s.bills.filter((b) => b.left > 0.004 && daysBetween(b.date, today) > days);
      if (!old.length) continue;
      out.push({ id: s.id, name: s.name, days: Math.max(...old.map((b) => daysBetween(b.date, today))), left: Math.round(s.bills.reduce((t, b) => t + (b.left > 0.004 ? b.left : 0), 0) * 100) / 100 });
    }
    return out.sort((a, b) => b.days - a.days || b.left - a.left);
  }
}

module.exports = new AttentionService();
