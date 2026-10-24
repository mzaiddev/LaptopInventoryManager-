// Login screen: shown over the whole app until the owner signs in.
const LoginPage = {
  async show() {
    const status = await window.api.authStatus();
    const hasOwner = status.success && status.data.hasOwner;
    const el = document.getElementById("login-screen");
    el.innerHTML = `
      <form class="login-card" onsubmit="LoginPage.submit(event)">
        <div class="login-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
        </div>
        <h2>Inventory Manager</h2>
        ${
          hasOwner
            ? `<div class="form-group"><label>Username</label>
                 <input class="form-control" id="login-user" autocomplete="username" autofocus></div>
               <div class="form-group"><label>Password</label>
                 <input class="form-control" id="login-pass" type="password" autocomplete="current-password"></div>
               <div class="form-error" id="login-error"></div>
               <button class="btn btn-primary login-btn" type="submit">Sign in</button>`
            : `<p class="login-note">This copy has not been activated yet. Please contact your software provider.</p>`
        }
      </form>`;
    el.style.display = "flex";
    document.getElementById("app").style.display = "none";
  },

  async submit(e) {
    e.preventDefault();
    const user = document.getElementById("login-user").value;
    const pass = document.getElementById("login-pass").value;
    const r = await window.api.login(user, pass);
    if (!r.success) {
      document.getElementById("login-error").textContent = r.error;
      return;
    }
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app").style.display = "";
    await App.start();
  },

  async logout() {
    await window.api.logout();
    await this.show();
  },
};
