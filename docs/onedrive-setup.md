# OneDrive backup: one-time setup

The app can copy every backup to the shop owner's **own** OneDrive (free 5 GB on a personal Microsoft account).
The app only asks for the `Files.ReadWrite.AppFolder` permission, so it can see one folder (`Apps/<app name>`) and nothing else in the owner's OneDrive.

There is **no secret**. You create one app registration and copy one value, the **Application (client) ID**.

## Get the Application (client) ID

1. Open <https://entra.microsoft.com> and sign in with a Microsoft account (Outlook, Hotmail or any).
2. **Entra ID → App registrations → New registration**.
3. Fill in:
   - **Name:** Shop Manager Backup
   - **Supported account types:** *Any Entra ID Tenant + Personal Microsoft accounts*
   - **Redirect URI:** platform **Public client/native (mobile & desktop)**, value `http://localhost`
4. Click **Register**. On the **Overview** page copy **Application (client) ID**. It looks like `12345678-90ab-cdef-1234-567890abcdef`.

Microsoft's guide lists an Azure account as a prerequisite for registering apps. The registration itself is free, but a new account may be asked for a card to verify identity. If entra.microsoft.com lets you open **App registrations**, nothing more is needed.

## Use it

In the app: **Backup & Restore → Online backup → OneDrive**.

1. Paste the Application (client) ID.
2. Click **Connect OneDrive**, sign in in the browser and allow access.

After that backups upload by themselves. Open the same card to change:

- **Upload automatically**: every daily backup is copied online.
- **Repeat while the app is open**: Only when the app opens / every 1, 3, 6 (default), 12 or 24 hours.
- **Keep the last N** online copies (default 30).

**Back up now** (top of the page) makes a verified copy on this PC and uploads it when OneDrive is connected. Progress shows under **Tasks** (top right).

To make an installer that already knows your app, put the ID in [src/config/microsoftClient.js](../src/config/microsoftClient.js) or set `LIM_ONEDRIVE_CLIENT_ID`.

## If something fails

| Message | Cause |
|---|---|
| "Microsoft does not know this Client ID" | The ID was copied wrongly, or the app was not registered for personal accounts |
| "The app registration needs the redirect address http://localhost" | Add the redirect under **Authentication → Add a platform → Mobile and desktop applications** |
| "OneDrive sign-in ended (the Microsoft password changed…)" | The owner changed the Microsoft password or removed access. Press **Connect OneDrive** again |
| "OneDrive is full" | Free some space or buy storage |
| "access_denied" | The owner declined the permission screen |

Shops may see an "unverified publisher" notice on the Microsoft sign-in page. Click **Continue**: it only means the app has no paid publisher verification.
