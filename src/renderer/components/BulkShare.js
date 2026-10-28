// Bulk WhatsApp sending: row selection for list pages plus a one-by-one send queue.
// WhatsApp cannot receive files automatically, so for each entry the queue builds the PDF,
// copies it to the clipboard and opens the chat; the owner pastes (Ctrl+V), sends, and
// clicks Next.
const BulkShare = {
  scopes: {}, // scope -> { items: Map(id -> item), selected: Set(id), visible: [id] }
  run: null, // active queue state

  _scope(name) {
    if (!this.scopes[name]) this.scopes[name] = { items: new Map(), selected: new Set(), visible: [] };
    return this.scopes[name];
  },

  esc(v) {
    return ShopInfo.esc(v);
  },

  // Called by a list page after each load with the rows now on screen: [{ id, label, phone }].
  register(scopeName, items) {
    const sc = this._scope(scopeName);
    sc.visible = items.map((i) => String(i.id));
    items.forEach((i) => sc.items.set(String(i.id), i));
  },

  isSelected(scopeName, id) {
    return this._scope(scopeName).selected.has(String(id));
  },

  allVisibleSelected(scopeName) {
    const sc = this._scope(scopeName);
    return sc.visible.length > 0 && sc.visible.every((id) => sc.selected.has(id));
  },

  toggle(scopeName, id, checked) {
    const sc = this._scope(scopeName);
    if (checked) sc.selected.add(String(id));
    else sc.selected.delete(String(id));
    this.refreshBar(scopeName);
  },

  toggleVisible(scopeName, checked) {
    const sc = this._scope(scopeName);
    sc.visible.forEach((id) => (checked ? sc.selected.add(id) : sc.selected.delete(id)));
    document.querySelectorAll(`input.bs-cb-${scopeName}`).forEach((cb) => (cb.checked = checked));
    this.refreshBar(scopeName);
  },

  clear(scopeName) {
    this._scope(scopeName).selected.clear();
    document.querySelectorAll(`input.bs-cb-${scopeName}`).forEach((cb) => (cb.checked = false));
    document.querySelectorAll(`input.bs-all-${scopeName}`).forEach((cb) => (cb.checked = false));
    this.refreshBar(scopeName);
  },

  selectedItems(scopeName) {
    const sc = this._scope(scopeName);
    return [...sc.selected].map((id) => sc.items.get(id)).filter(Boolean);
  },

  // Checkbox cells for a table row / header.
  headerCheckbox(scopeName) {
    return `<th style="width:34px;"><input type="checkbox" class="bs-all-${scopeName}" title="Select all on this page" ${this.allVisibleSelected(scopeName) ? "checked" : ""} onchange="BulkShare.toggleVisible('${scopeName}', this.checked)"></th>`;
  },

  rowCheckbox(scopeName, id) {
    return `<td><input type="checkbox" class="bs-cb-${scopeName}" ${this.isSelected(scopeName, id) ? "checked" : ""} onchange="BulkShare.toggle('${scopeName}', ${JSON.stringify(String(id))}, this.checked)"></td>`;
  },

  // Bar above the table. onSelected / onAll are JS call strings, e.g. "CustomersPage.sendSelected()".
  barHtml(scopeName, onSelected, onAll, allLabel = "WhatsApp All") {
    const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2.1-5.2A8.5 8.5 0 1 1 21 11.5z"/></svg>';
    return `
      <div id="bs-bar-${scopeName}" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
        <span id="bs-count-${scopeName}" style="font-size:13px;color:var(--text-muted);">0 selected</span>
        <button class="btn btn-sm btn-success" id="bs-send-${scopeName}" onclick="${onSelected}" disabled>${icon} WhatsApp Selected</button>
        <button class="btn btn-sm btn-secondary" onclick="${onAll}">${icon} ${allLabel}</button>
        <button class="btn btn-sm btn-secondary" id="bs-clear-${scopeName}" onclick="BulkShare.clear('${scopeName}')" style="display:none;">Clear selection</button>
      </div>`;
  },

  refreshBar(scopeName) {
    const n = this._scope(scopeName).selected.size;
    const count = document.getElementById(`bs-count-${scopeName}`);
    if (count) count.textContent = n + " selected";
    const send = document.getElementById(`bs-send-${scopeName}`);
    if (send) send.disabled = n === 0;
    const clear = document.getElementById(`bs-clear-${scopeName}`);
    if (clear) clear.style.display = n ? "" : "none";
    const all = document.querySelector(`input.bs-all-${scopeName}`);
    if (all) all.checked = this.allVisibleSelected(scopeName);
  },

  // items: [{ id, label, phone }]; prepare(item) -> { html, customerName, phone, message }
  // Linked WhatsApp: one confirmation, then everything is sent automatically.
  // Not linked: link by QR code, or send one by one the old way.
  start({ title, items, prepare }) {
    if (!items || items.length === 0) {
      Toast.warning("Nothing to send.");
      return;
    }
    this.run = { title, items, prepare, idx: 0, stage: "intro", sent: [], skipped: [], busy: false, stopped: false, stopRequested: false };
    this._openModal();
    this._render();
  },

  _openModal() {
    const r = this.run;
    Modal.show({
      title: this.esc(r.title),
      body: '<div id="bs-queue"></div>',
      size: "",
      onClose: () => {
        if (this.run) {
          this.run.stopped = true;
          this.run.stopRequested = true; // an automatic run stops after the message in progress
        }
      },
    });
  },

  // Messages go out 5-11 s apart with a rest every 20, so this is the honest time estimate.
  _estimate(n) {
    const seconds = Math.round(n * 9 + Math.floor(n / 20) * 60);
    if (seconds < 90) return "about a minute";
    return "about " + Math.round(seconds / 60) + " minutes";
  },

  _render() {
    const r = this.run;
    const box = document.getElementById("bs-queue");
    if (!r || !box) return;
    const total = r.items.length;

    if (r.stage === "intro") {
      const linked = WhatsAppLink.isLinked();
      box.innerHTML = linked
        ? '<p style="font-size:15px;margin-bottom:10px;"><strong>' + total + "</strong> " + (total === 1 ? "message" : "messages") + " will be sent automatically on WhatsApp" +
          (WhatsAppLink.status.phone ? " from +" + this.esc(WhatsAppLink.status.phone) : "") + ".</p>" +
          '<p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">They go out a few seconds apart to keep your number safe, so this takes ' + this._estimate(total) +
          ". Keep this window open until it says All done.</p>" +
          '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">' +
          '<button class="btn btn-secondary" onclick="BulkShare.stop()">Cancel</button>' +
          '<button class="btn btn-secondary" onclick="BulkShare.begin()">Send one by one instead</button>' +
          '<button class="btn btn-success" onclick="BulkShare.startAuto()">Send now</button></div>'
        : '<p style="font-size:15px;margin-bottom:10px;"><strong>' + total + "</strong> " + (total === 1 ? "message" : "messages") + " to send.</p>" +
          '<p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">Link your WhatsApp once by scanning a QR code, like WhatsApp Web, and everything sends automatically with no clicking.</p>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">' +
          '<button class="btn btn-secondary" onclick="BulkShare.stop()">Cancel</button>' +
          '<button class="btn btn-secondary" onclick="BulkShare.begin()">Send one by one instead</button>' +
          '<button class="btn btn-success" onclick="BulkShare.link()">Link WhatsApp</button></div>';
      return;
    }

    if (r.stage === "sending") {
      const pct = Math.round(((r.idx) / total) * 100);
      const item = r.items[Math.min(r.idx, total - 1)];
      box.innerHTML =
        '<div style="height:8px;background:var(--border-color);border-radius:4px;margin-bottom:14px;"><div style="height:8px;width:' + pct + '%;background:var(--success);border-radius:4px;"></div></div>' +
        '<p style="font-size:13px;color:var(--text-muted);">Sending ' + (Math.min(r.idx + 1, total)) + " of " + total + "</p>" +
        '<p style="font-size:18px;font-weight:700;margin:4px 0 8px;">' + this.esc(item.label) + "</p>" +
        '<p style="font-size:13px;margin-bottom:16px;">Sent: <strong>' + r.sent.length + "</strong> &nbsp; Skipped: <strong>" + r.skipped.length + "</strong><br>" +
        '<span style="color:var(--text-muted);">Keep this window open. You can keep it in the background.</span></p>' +
        '<div style="display:flex;justify-content:flex-end;"><button class="btn btn-secondary" onclick="BulkShare.requestStop()" ' + (r.stopRequested ? "disabled" : "") + ">" +
        (r.stopRequested ? "Stopping after this one..." : "Stop") + "</button></div>";
      return;
    }

    if (r.stage === "done") {
      const skippedHtml = r.skipped.length
        ? '<p style="font-size:13px;margin-top:10px;"><strong>Not sent (' + r.skipped.length + "):</strong></p>" +
          '<ul style="font-size:13px;margin:4px 0 0 18px;max-height:180px;overflow:auto;">' +
          r.skipped.map((x) => "<li>" + this.esc(x.label) + " - " + this.esc(x.reason) + "</li>").join("") + "</ul>"
        : "";
      const verb = r.mode === "auto" ? "Sent" : "Opened";
      box.innerHTML =
        '<p style="font-size:16px;"><strong>' + (r.stopped ? "Stopped" : "All done") + ".</strong> " + verb + " " + r.sent.length + " of " + total + (r.mode === "auto" ? " messages" : " chats") + ".</p>" +
        skippedHtml +
        '<div style="display:flex;justify-content:flex-end;margin-top:16px;"><button class="btn btn-primary" onclick="BulkShare.stop()">Close</button></div>';
      return;
    }

    // Manual one-by-one mode
    const item = r.items[r.idx];
    const pct = Math.round((r.idx / total) * 100);
    const opened = r.stage === "opened";
    box.innerHTML =
      '<div style="height:6px;background:var(--border-color);border-radius:3px;margin-bottom:14px;"><div style="height:6px;width:' + pct + '%;background:var(--primary);border-radius:3px;"></div></div>' +
      '<p style="font-size:13px;color:var(--text-muted);">' + (r.idx + 1) + " of " + total + "</p>" +
      '<p style="font-size:18px;font-weight:700;margin:4px 0 12px;">' + this.esc(item.label) + "</p>" +
      '<p style="font-size:13px;margin-bottom:16px;">' +
      (opened ? "WhatsApp is open. Press <strong>Ctrl+V</strong>, then <strong>Send</strong>. When done, click Next." : "Click <strong>Open WhatsApp</strong> to prepare this one.") + "</p>" +
      '<div style="display:flex;gap:8px;justify-content:space-between;">' +
      '<button class="btn btn-secondary" onclick="BulkShare.finish()" ' + (r.busy ? "disabled" : "") + ">Stop</button>" +
      '<div style="display:flex;gap:8px;">' +
      '<button class="btn btn-secondary" onclick="BulkShare.skip(' + "'Skipped by you'" + ')" ' + (r.busy ? "disabled" : "") + ">Skip</button>" +
      (opened
        ? '<button class="btn btn-primary" onclick="BulkShare.next()">Next</button>'
        : '<button class="btn btn-success" onclick="BulkShare.open()" ' + (r.busy ? "disabled" : "") + ">" + (r.busy ? "Preparing..." : "Open WhatsApp") + "</button>") +
      "</div></div>";
  },

  // ---- Link, then come back to this panel
  link() {
    WhatsAppLink.showLink(() => {
      if (!this.run) return;
      this._openModal();
      this._render();
    });
  },

  // ---- Automatic mode: one click, everything is sent
  async startAuto() {
    const r = this.run;
    if (!r || r.stage === "sending") return;
    r.mode = "auto";
    r.stage = "sending";
    let hardFails = 0;
    this._render();

    for (r.idx = 0; r.idx < r.items.length; r.idx++) {
      if (r.stopRequested) break;
      const item = r.items[r.idx];
      this._render();
      try {
        const payload = await r.prepare(item);
        if (!payload || !String(payload.phone || "").trim()) {
          r.skipped.push({ label: item.label, reason: "No phone number" });
          continue;
        }
        const res = await window.api.autoSendStatement(payload);
        if (res.success) {
          r.sent.push(item);
          hardFails = 0;
        } else if (res.code === "NOT_ON_WHATSAPP") {
          r.skipped.push({ label: item.label, reason: "Not on WhatsApp" });
        } else if (res.code === "INVALID_NUMBER") {
          r.skipped.push({ label: item.label, reason: "Invalid phone number" });
        } else if (res.code === "NOT_LINKED") {
          r.skipped.push({ label: item.label, reason: "WhatsApp got disconnected" });
          r.stopped = true;
          r.idx += 1;
          break; // nothing else can be sent until WhatsApp is linked again
        } else {
          r.skipped.push({ label: item.label, reason: res.error || "Could not send" });
          hardFails += 1;
          if (hardFails >= 3) { // three in a row: something is wrong, so stop instead of failing the rest
            r.stopped = true;
            r.idx += 1;
            break;
          }
        }
      } catch (err) {
        r.skipped.push({ label: item.label, reason: err.message });
        hardFails += 1;
        if (hardFails >= 3) { r.stopped = true; r.idx += 1; break; }
      }
    }
    if (r.stopRequested) r.stopped = true;
    // Entries never reached are listed, so the owner knows who still needs a statement.
    for (let i = r.idx; i < r.items.length; i++) r.skipped.push({ label: r.items[i].label, reason: "Not sent (stopped)" });
    r.stage = "done";
    this._render();
  },

  requestStop() {
    if (this.run) {
      this.run.stopRequested = true;
      this._render();
    }
  },

  // ---- Manual one-by-one mode (used when WhatsApp is not linked, or by choice)
  begin() {
    this.run.mode = "manual";
    this.run.stage = "ready";
    this._render();
  },

  async open() {
    const r = this.run;
    if (!r || r.busy) return;
    const item = r.items[r.idx];
    r.busy = true;
    this._render();
    try {
      const payload = await r.prepare(item);
      if (!payload || !String(payload.phone || "").trim()) {
        r.busy = false;
        this.skip("No phone number");
        return;
      }
      const res = await window.api.shareStatement(payload);
      if (!res.success) throw new Error(res.error || "Could not create the PDF.");
      if (res.data.chat === "none") {
        r.busy = false;
        this.skip("Invalid phone number");
        return;
      }
      if (!res.data.clipboardOk) Toast.warning("The PDF is in the folder that opened: drag it into the chat.");
      r.stage = "opened";
    } catch (err) {
      Toast.error(err.message);
    }
    r.busy = false;
    this._render();
  },

  next() {
    const r = this.run;
    if (!r) return;
    r.sent.push(r.items[r.idx]);
    this._advance();
  },

  skip(reason) {
    const r = this.run;
    if (!r) return;
    r.skipped.push({ label: r.items[r.idx].label, reason });
    this._advance();
  },

  _advance() {
    const r = this.run;
    r.idx += 1;
    r.stage = r.idx >= r.items.length ? "done" : "ready";
    this._render();
  },

  // Stop early in manual mode: show the summary.
  finish() {
    const r = this.run;
    if (!r) return;
    r.stopped = true;
    r.stage = "done";
    this._render();
  },

  stop() {
    this.run = null;
    Modal.close();
  },
};

window.BulkShare = BulkShare;
