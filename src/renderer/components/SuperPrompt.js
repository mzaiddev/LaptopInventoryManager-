// Asks for the super-password and checks it in the main process.
// ask(title, apiFn) resolves true when apiFn(password) succeeds.
const SuperPrompt = {
  ask(title, apiFn) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        resolve(ok);
      };
      Modal.show({
        title,
        size: "sm",
        body: `<form onsubmit="return false;">
            <div class="form-group"><label>Super-Password</label>
              <input type="password" class="form-control" id="sp-input" autocomplete="off"></div>
            <div class="form-error" id="sp-error"></div>
          </form>`,
        footer: `<button class="btn btn-secondary" onclick="window.Modal.close()">Cancel</button>
                 <button class="btn btn-primary" id="sp-ok">Confirm</button>`,
        onClose: () => finish(false),
      });
      const input = document.getElementById("sp-input");
      const submit = async () => {
        const r = await apiFn(input.value);
        if (r.success) {
          finish(true);
          Modal.close();
        } else {
          document.getElementById("sp-error").textContent = r.error || "Wrong super-password";
          input.select();
        }
      };
      document.getElementById("sp-ok").addEventListener("click", submit);
      input.addEventListener("keydown", (e) => e.key === "Enter" && submit());
      input.focus();
    });
  },

  // Edit/delete: the grant is valid for exactly one save/delete.
  requireForAction(title = "Enter super-password") {
    return this.ask(title, (pw) => window.api.grantSuper(pw));
  },
};
