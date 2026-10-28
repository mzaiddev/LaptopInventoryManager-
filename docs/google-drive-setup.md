# Google Drive backup — one-time setup (for you, the vendor)

The app can upload every backup to the shop owner's **own** Google Drive. For that, Google needs to know the app. You do this once; shops never touch Google Cloud.

The app only asks for the `drive.file` permission, so it can see only the files it creates itself, never the owner's other Drive files.

## Steps

1. Open <https://console.cloud.google.com/> and create a project, for example **Shop Manager Backup**.
2. **APIs & Services → Library →** search **Google Drive API → Enable**.
3. **APIs & Services → OAuth consent screen**
   - User type: **External**.
   - App name, support email, and your developer email.
   - Scopes: add `.../auth/drive.file` (non-sensitive).
   - **Publishing status: click "Publish app" (In production).** If it stays on *Testing*, Google expires every shop's sign-in after about 7 days and only listed test users can connect. Check Google's current rules when you do this.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Desktop app**.
   - Copy the **Client ID** and the **Client secret**.
5. Open the app, go to **Backup & Restore**, paste the **Client ID** and **Client secret** into the Google Drive card, and click **Connect owner Drive**. The secret is saved encrypted on that PC, never in the database.

   To build an installer that already knows your client, you can instead fill [src/config/googleClient.js](../src/config/googleClient.js) or set `LIM_GOOGLE_CLIENT_ID` / `LIM_GOOGLE_CLIENT_SECRET`.

## What each shop does

Backup & Restore → **Connect Google Drive** → sign in in the browser → done. After that, every backup uploads when the PC is online and retries by itself if it is not.

## If something fails

| Message | Cause |
|---|---|
| "Google Drive is not configured in this app build" | Client ID is empty (step 5) |
| Sign-in works but "client_secret is missing" | Add the client secret (step 5) |
| Sign-in stops working after about a week | App is still in *Testing* (step 3) |
| "access_denied" | The owner declined the permission screen |

## Without Google Cloud at all

Install **Google Drive for Desktop** on the shop PC and set Settings → **Backup Folder** to a folder inside the Drive folder. Drive then syncs the backups. No setup on your side.
