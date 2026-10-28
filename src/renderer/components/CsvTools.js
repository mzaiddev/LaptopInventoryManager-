// CSV import (template, preview, confirm) and export, shared by the list pages.
// Exports are plain CSV with a byte-order mark, so Excel opens them correctly (Urdu included).
const CsvTools = {
  esc(v) { return ShopInfo.esc(v == null ? "" : String(v)); },

  download(filename, rows) {
    const url = URL.createObjectURL(new Blob(["﻿", Csv.stringify(rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },

  stamp() { return new Date().toLocaleDateString("sv-SE"); },

  // options: { title, templateName, templateRows, run(rows, dryRun) -> { total, valid, created, skipped[] }, onDone }
  openImport(options) {
    this._opts = options;
    this._rows = null;
    Modal.show({
      title: this.esc(options.title),
      size: "lg",
      body: `
        <button class="btn btn-secondary btn-sm" onclick="CsvTools.template()">Download CSV template</button>
        <div class="form-group" style="margin-top:14px;"><label>CSV file</label><input class="form-control" id="csv-import-file" type="file" accept=".csv,text/csv" onchange="CsvTools.onFile()"></div>
        <div id="csv-import-preview" style="color:var(--text-muted);">Choose a CSV file to check it before anything is saved.</div>`,
      footer: '<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" id="csv-import-go" disabled onclick="CsvTools.confirm()">Import</button>',
    });
  },

  template() {
    this.download(this._opts.templateName, this._opts.templateRows);
  },

  async onFile() {
    const box = document.getElementById("csv-import-preview");
    const go = document.getElementById("csv-import-go");
    go.disabled = true;
    this._rows = null;
    const file = document.getElementById("csv-import-file").files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { box.textContent = "CSV files must be 5 MB or smaller."; return; }
    try {
      const rows = Csv.toObjects(Csv.parse(await file.text()));
      if (!rows.length) throw new Error("The CSV needs a header row and at least one data row.");
      const r = await this._opts.run(rows, true);
      if (!r.success) throw new Error(r.error);
      this._rows = rows;
      this.showReport(box, r.data, false);
      go.disabled = r.data.valid === 0;
      go.textContent = r.data.valid ? `Import ${r.data.valid} row${r.data.valid === 1 ? "" : "s"}` : "Import";
    } catch (err) {
      box.innerHTML = `<span style="color:var(--danger);">${this.esc(err.message)}</span>`;
    }
  },

  showReport(box, d, done) {
    const problems = d.skipped.slice(0, 50);
    box.innerHTML = `
      <p style="margin-bottom:8px;"><strong>${done ? d.created : d.valid}</strong> row${(done ? d.created : d.valid) === 1 ? "" : "s"} ${done ? "imported" : "ready to import"}${d.skipped.length ? `, <strong style="color:var(--danger);">${d.skipped.length}</strong> skipped` : ""} (of ${d.total}).</p>
      ${problems.length ? `<div class="table-wrapper" style="max-height:220px;overflow:auto;"><table><thead><tr><th>Row</th><th>Name</th><th>Why it was skipped</th></tr></thead><tbody>${problems.map((s) => `<tr><td>${s.row}</td><td>${this.esc(s.name)}</td><td>${this.esc(s.reason)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${d.skipped.length > 50 ? `<p style="color:var(--text-muted);margin-top:6px;">…and ${d.skipped.length - 50} more.</p>` : ""}`;
  },

  async confirm() {
    const go = document.getElementById("csv-import-go");
    go.disabled = true;
    const r = await this._opts.run(this._rows, false);
    const box = document.getElementById("csv-import-preview");
    if (!r.success) { box.innerHTML = `<span style="color:var(--danger);">${this.esc(r.error)}</span>`; return; }
    this.showReport(box, r.data, true);
    go.style.display = "none";
    Toast.success(`${r.data.created} imported.`);
    if (this._opts.onDone) this._opts.onDone();
  },
};
