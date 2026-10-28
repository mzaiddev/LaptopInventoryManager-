const { getDatabase } = require("../database/dbInit");
const { roundMoney } = require("../utils/money");

const FLOW = ["Received", "Repairing", "Ready", "Delivered"];
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
const today = () => new Date().toLocaleDateString("sv-SE");

// Repair jobs: a job card that moves Received -> Repairing -> Ready -> Delivered.
// The charge is billed on the customer's account when the job is delivered; payments go through the
// customer ledger, so they show in the cash book like any other customer payment.
class ServiceJobService {
  get(id) {
    const job = getDatabase().prepare("SELECT j.*, c.customer_name, c.phone FROM service_jobs j JOIN customers c ON c.id = j.customer_id WHERE j.id = ?").get(id);
    if (!job) throw new Error("Service job not found");
    return job;
  }

  list({ status, search } = {}) {
    const where = [];
    const args = [];
    if (status) { where.push("j.status = ?"); args.push(status); }
    if (search) {
      where.push("(j.job_no LIKE ? OR j.device LIKE ? OR j.serial_number LIKE ? OR j.fault LIKE ? OR c.customer_name LIKE ? OR c.phone LIKE ?)");
      const q = `%${search}%`;
      args.push(q, q, q, q, q, q);
    }
    return getDatabase().prepare(`
      SELECT j.*, c.customer_name, c.phone FROM service_jobs j JOIN customers c ON c.id = j.customer_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY j.id DESC`).all(...args);
  }

  _clean(d) {
    const device = String(d.device || "").trim();
    if (!device) throw new Error("Device is required");
    const charge = roundMoney(d.charge === "" || d.charge == null ? 0 : d.charge);
    if (!(charge >= 0)) throw new Error("Charge cannot be negative");
    return { device, charge, serial_number: String(d.serial_number || "").trim(), fault: String(d.fault || "").trim(), notes: String(d.notes || "").trim() };
  }

  add(data) {
    const db = getDatabase();
    if (!db.prepare("SELECT 1 FROM customers WHERE id = ?").get(data.customer_id)) throw new Error("Customer not found");
    const d = this._clean(data);
    const date = isDate(data.received_date) ? data.received_date : today();
    const prefix = `SRV-${date.replace(/-/g, "")}-`;
    const n = db.prepare("SELECT COUNT(*) n FROM service_jobs WHERE job_no LIKE ?").get(prefix + "%").n + 1;
    const job_no = prefix + String(n).padStart(4, "0");
    const r = db.prepare("INSERT INTO service_jobs (job_no, customer_id, device, serial_number, fault, charge, notes, received_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(job_no, data.customer_id, d.device, d.serial_number, d.fault, d.charge, d.notes, date);
    return { id: Number(r.lastInsertRowid), job_no };
  }

  update(id, data) {
    const job = this.get(id);
    if (job.billed || ["Delivered", "Cancelled"].includes(job.status)) throw new Error("This job was billed or closed (delivered or cancelled), so it can no longer be edited");
    const d = this._clean({ ...job, ...data });
    getDatabase().prepare("UPDATE service_jobs SET device = ?, serial_number = ?, fault = ?, charge = ?, notes = ?, updated_at = datetime('now','localtime') WHERE id = ?")
      .run(d.device, d.serial_number, d.fault, d.charge, d.notes, id);
    return { success: true };
  }

  setStatus(id, status, { date } = {}) {
    const db = getDatabase();
    const job = this.get(id);
    if (["Delivered", "Cancelled"].includes(job.status)) throw new Error(`This job is already ${job.status}`);
    const when = isDate(date) ? date : today();
    if (status !== "Cancelled" && FLOW.indexOf(status) !== FLOW.indexOf(job.status) + 1) {
      throw new Error(`A job goes ${FLOW.join(", ")}. It cannot move to ${status} from ${job.status}.`);
    }
    db.transaction(() => {
      db.prepare("UPDATE service_jobs SET status = ?, ready_date = CASE WHEN ? = 'Ready' THEN ? ELSE ready_date END, delivered_date = CASE WHEN ? = 'Delivered' THEN ? ELSE delivered_date END, updated_at = datetime('now','localtime') WHERE id = ?")
        .run(status, status, when, status, when, id);
      if (status === "Delivered" && job.charge > 0 && !job.billed) {
        require("./ledgerService")._addLedgerEntry(job.customer_id, "Adjustment", id, `Service job ${job.job_no}`, job.charge, 0, when);
        db.prepare("UPDATE service_jobs SET billed = 1 WHERE id = ?").run(id);
      }
    })();
    return { success: true };
  }

  addPayment(id, { amount, payment_method, payment_date }) {
    const db = getDatabase();
    const job = this.get(id);
    const value = roundMoney(amount);
    db.transaction(() => {
      require("./ledgerService").addLedgerPayment({
        customer_id: job.customer_id, amount: value, payment_method, payment_date: isDate(payment_date) ? payment_date : today(),
        description: `Service job ${job.job_no} - ${payment_method}`,
      });
      db.prepare("UPDATE service_jobs SET paid = paid + ?, updated_at = datetime('now','localtime') WHERE id = ?").run(value, id);
    })();
    return { success: true };
  }
}

module.exports = new ServiceJobService();
