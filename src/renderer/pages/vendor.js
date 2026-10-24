// Vendor console (Ctrl+Shift+V): sets up the owner login for this installation.
const VendorPage = {
  async open() {
    const st = await window.api.authStatus();
    const id = st.success ? st.data.installId : "";
    let el = document.getElementById("vendor-screen");
    if (!el) {
      el = document.createElement("div");
      el.id = "vendor-screen";
      document.body.appendChild(el);
    }
    el.innerHTML = `
      <form class="login-card vendor-card" onsubmit="VendorPage.submit(event)">
        <h2>Setup</h2>
        <div class="form-group"><label>Install ID</label>
          <input class="form-control" value="${id}" readonly onclick="this.select()"></div>
        <div class="form-group"><label>Activation Key</label>
          <input class="form-control" id="vd-key" autocomplete="off"></div>
        <div class="form-group"><label>Shop Name</label>
          <input class="form-control" id="vd-shop"></div>
        <div class="form-row">
          <div class="form-group"><label>Owner Username</label>
            <input class="form-control" id="vd-user" autocomplete="off"></div>
          <div class="form-group"><label>Owner Password</label>
            <input class="form-control" id="vd-pass" type="password" autocomplete="new-password"></div>
        </div>
        <div class="form-group"><label>Super-Password</label>
          <input class="form-control" id="vd-super" type="password" autocomplete="new-password"></div>
        <div class="form-error" id="vd-error"></div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" type="button" style="flex:1" onclick="VendorPage.close()">Cancel</button>
          <button class="btn btn-primary" type="submit" style="flex:1">Save</button>
        </div>
      </form>`;
    el.style.display = "flex";
  },

  close() {
    const el = document.getElementById("vendor-screen");
    if (el) el.style.display = "none";
  },

  async submit(e) {
    e.preventDefault();
    const v = (id) => document.getElementById(id).value;
    const r = await window.api.vendorProvision({
      key: v("vd-key").trim(),
      shopName: v("vd-shop"),
      username: v("vd-user"),
      password: v("vd-pass"),
      superPassword: v("vd-super"),
    });
    if (!r.success) {
      document.getElementById("vd-error").textContent = r.error;
      return;
    }
    this.close();
    Toast.success("Owner account saved. Please sign in.");
    await LoginPage.show();
  },
};

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "v") VendorPage.open();
});
