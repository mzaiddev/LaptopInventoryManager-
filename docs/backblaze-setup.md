# Backblaze B2 backup: setup (10 GB free)

The app uploads every backup to the shop owner's **own private Backblaze B2 bucket**. There is no sign-in page and no developer app to register: the owner pastes two values, a **keyID** and an **applicationKey**, created for that one bucket.

## 1. Create the account
1. Open <https://www.backblaze.com> and click **Sign Up**. Choose **B2 Cloud Storage** (not the computer-backup product) and create the account.
2. Confirm the email address, and the phone number if Backblaze asks.

Backblaze's pricing page is the final word on the free 10 GB. Check it when you sign up.

## 2. Create a private bucket
1. **B2 Cloud Storage → Buckets → Create a Bucket**.
2. **Bucket Unique Name:** for example `shop-backups-yourname` (names are shared by everyone, so add something of your own).
3. **Files in Bucket are:** **Private**. Leave the other options as they are. Click **Create a Bucket**.

## 3. Create a key for that bucket only
1. **Application Keys → Add a New Application Key**.
2. **Name:** Shop Manager.
3. **Allow access to Bucket(s):** choose your bucket (not "All").
4. **Type of Access:** **Read and Write**.
5. Click **Create New Key**.
6. Copy the **keyID** and the **applicationKey** now. Backblaze shows the applicationKey **only once**. If you lose it, delete the key and create a new one.

## 4. Connect in the app
**Backup & Restore → Online backup → Backblaze B2**

1. Paste the keyID and the applicationKey. (Leave *Bucket name* empty: a key limited to one bucket already knows its bucket.)
2. Click **Connect Backblaze B2**. The app tests the keys and the bucket. Nothing is uploaded yet.
3. Click **Back up now** at the top of the page. Progress shows under **Tasks** (top right).

After that, backups upload by themselves. In the same card you can change:
- **Upload automatically** (on by default).
- **Repeat while the app is open** (only when the app opens / every 1, 3, 6, 12 or 24 hours).
- **Keep the last N** online copies (default 30). Older copies are deleted so the 10 GB is never reached.

## If something fails

| Message | Cause |
|---|---|
| "Backblaze did not accept that Key ID and Application Key" | One of them was copied wrongly, or the key was deleted. Create a new key |
| "missing permission to: writeFiles…" | The key was created with *Read Only*. Create it again with **Read and Write** |
| "This key can see more than one bucket. Type the bucket name too." | The key was created for **All** buckets. Type the bucket name, or create a key for one bucket |
| "Bucket … is public" | Change the bucket to **Private** in Backblaze |
| "Backblaze storage limit reached" | Free space or a cap in Backblaze (Caps & Alerts) is used up. Delete old online backups or raise the cap |

## Safe to know
- The keys are stored encrypted on the PC with Windows secure storage and are never shown back on the screen.
- Only verified backups are uploaded, and a downloaded backup is checked before it can be restored.
- Keep the local daily backups too, and log in to Backblaze now and then, because free accounts can be closed after a long time without use.
