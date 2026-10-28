// The owner's own WhatsApp, linked once by scanning a QR code. While linked, PDFs are sent automatically.
// The main process pushes every change, so nothing here polls.
const WhatsAppLink = {
  status: { state: "unlinked", qr: null, phone: null, error: null },
  watchers: new Set(),

  async init() {
    if (this._started) return;
    this._started = true;
    window.api.onWaChanged((s) => this._apply(s));
    const r = await window.api.waStatus();
    if (r.success) this._apply(r.data);
  },

  _apply(s) {
    this.status = s;
    this.watchers.forEach((fn) => fn(s));
  },

  isLinked() {
    return this.status.state === "linked";
  },

  esc(v) {
    return ShopInfo.esc(v);
  },

  // ---- Link by QR code
  // onLinked runs once the phone has scanned the code.
  async showLink(onLinked) {
    const done = () => {
      this.watchers.delete(update);
    };
    const update = (s) => {
      const box = document.getElementById("wa-link-box");
      if (!box) return done();
      if (s.state === "linked") {
        done();
        Modal.close();
        Toast.success("WhatsApp linked.");
        if (onLinked) onLinked();
        return;
      }
      box.innerHTML = this.qrHtml(s);
    };
    this.watchers.add(update);
    Modal.show({
      title: "Link WhatsApp",
      size: "",
      body: `<div id="wa-link-box">${this.qrHtml({ state: "connecting" })}</div>`,
      footer: '<button class="btn btn-secondary" onclick="window.Modal.close()">Cancel</button>',
      onClose: done,
    });
    const r = await window.api.waConnect();
    if (!r.success) {
      done();
      Toast.error(r.error || "Could not reach WhatsApp. Check the internet connection.");
    }
  },

  qrHtml(s) {
    if (s.state === "qr" && s.qr) {
      return `
        <div style="text-align:center;">
          <img src="${s.qr}" alt="WhatsApp QR code" style="width:220px;height:220px;image-rendering:pixelated;">
        </div>
        <ol style="margin:12px 0 0 18px;font-size:14px;line-height:1.7;">
          <li>Open <strong>WhatsApp</strong> on your phone</li>
          <li>Tap <strong>Settings</strong> &rarr; <strong>Linked devices</strong></li>
          <li>Tap <strong>Link a device</strong> and scan this code</li>
        </ol>`;
    }
    if (s.error) return `<p style="color:var(--danger);">${this.esc(s.error)}</p>`;
    return '<div class="loading"><div class="spinner"></div></div><p style="text-align:center;">Connecting to WhatsApp...</p>';
  },

  async unlink() {
    const r = await window.api.waUnlink();
    if (!r.success) return Toast.error(r.error);
    Toast.success("WhatsApp unlinked.");
  },

  // ---- Settings card
  cardHtml() {
    const s = this.status;
    const linked = s.state === "linked";
    return `
      <div class="card-header"><h3>WhatsApp Sending</h3></div>
      <div class="card-body">
        <p style="margin-bottom:10px;">
          ${linked
            ? `<strong style="color:var(--success);">Linked</strong>${s.phone ? " to +" + this.esc(s.phone) : ""}. Statements and invoices are sent automatically.`
            : s.state === "connecting" || s.state === "qr"
              ? "Connecting..."
              : "Not linked. Link your WhatsApp once and statements and invoices are sent automatically, with no clicking."}
        </p>
        ${s.error && !linked ? `<p style="color:var(--danger);margin-bottom:10px;">${this.esc(s.error)}</p>` : ""}
        ${linked
          ? '<button class="btn btn-secondary" onclick="WhatsAppLink.unlink()">Unlink WhatsApp</button>'
          : '<button class="btn btn-primary" onclick="WhatsAppLink.showLink()">Link WhatsApp</button>'}
        <p style="margin-top:12px;font-size:12px;color:var(--text-muted);">
          This uses your own WhatsApp like WhatsApp Web, not the official business service. Messages are sent a few seconds apart to keep your number safe.
          Keep this app open and the PC online while sending.
        </p>
      </div>`;
  },

  // Keeps the Settings card in step with the link while the page is open.
  mountCard() {
    const render = () => {
      const el = document.getElementById("wa-link-card");
      if (!el) return this.watchers.delete(render);
      el.innerHTML = this.cardHtml();
    };
    this.watchers.add(render);
    render();
  },

  // ---- One message
  // Linked: sent straight away. Not linked: the old way (PDF on the clipboard, chat opens).
  async shareOne(payload) {
    if (this.isLinked()) {
      if (!String(payload.phone || "").trim()) return Toast.warning("This contact has no phone number.");
      const r = await window.api.autoSendStatement(payload);
      if (r.success) return Toast.success("Sent on WhatsApp.");
      if (r.code === "NOT_ON_WHATSAPP") return Toast.warning("This number is not on WhatsApp.");
      if (r.code === "INVALID_NUMBER") return Toast.warning("This phone number is not valid.");
      return Toast.error(r.error || "Could not send on WhatsApp.");
    }
    const r = await window.api.shareStatement(payload);
    if (!r.success) Toast.error(r.error || "Could not create the PDF.");
    else if (r.data.chat === "none") Toast.warning("PDF saved. This contact has no valid phone number, so WhatsApp was not opened.");
    else if (r.data.clipboardOk) Toast.success("PDF copied. In the WhatsApp chat press Ctrl+V, then Send.");
    else Toast.warning("WhatsApp opened. The PDF is in the folder that just opened: drag it into the chat.");
  },
};

window.WhatsAppLink = WhatsAppLink;
