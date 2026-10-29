// Optional built-in Microsoft (OneDrive) Application (client) ID. See docs/onedrive-setup.md.
//
// Normally leave it empty: the owner pastes the Application (client) ID on the Backup page. There is no secret.
// Fill it in only to build one installer that already knows your app. LIM_ONEDRIVE_CLIENT_ID also works.
module.exports = {
  clientId: "",
};
