# Vendor Guide: setting up a new shop

Every installed copy is locked until you activate it. The shop owner cannot do this.

## One time
1. Create your key pair (already done on this PC, in `C:\Users\<you>\LaptopInventoryVendor`):
   `node tools/vendor-keygen.js --init`
2. Back up `private.pem` somewhere safe. Anyone who has it can activate copies. If it is lost you can no longer activate new shops.
3. `public.pem` is already pasted into `src/config/vendorPublicKey.js`. Do not change it after you have sold copies.

## For each new shop
1. Install the app on the shop PC and open it. The login screen says "This copy has not been activated yet".
2. Press **Ctrl + Shift + V**. Read the **Install ID** (for example `D615-00A3-77E4-851B`).
3. On your PC run: `node tools/vendor-keygen.js <Install ID>`. Copy the key it prints.
4. Back in the shop's Setup screen, paste the key and enter the shop name, owner username, owner password and super-password. Save.
5. The owner signs in. They can change both passwords later in **Settings > Security**.

## If the owner forgets a password
Repeat steps 2 to 4 for that PC. It replaces the owner login only; shop data is not touched.

## Notes
- The key works only for that one install, so it cannot be reused on another PC.
- Everything stays on the shop PC. Data files: `%APPDATA%\LaptopInventoryManager\data\inventory.db`. Daily automatic backups: `...\backups\auto`.
- The super-password protects editing and deleting products and showing purchase prices.
- Trial runs: set the environment variable `LIM_DATA_DIR` to a scratch folder to keep test data away from real data.
