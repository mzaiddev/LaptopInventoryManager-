// Optional built-in Google OAuth client for "Back up to Google Drive". See docs/google-drive-setup.md.
//
// Normally leave both empty: the owner types the Client ID and Client secret on the Backup page, and the secret
// is saved encrypted on that PC. Fill these in only to build one installer that already knows your Google client.
// The environment variables LIM_GOOGLE_CLIENT_ID and LIM_GOOGLE_CLIENT_SECRET also work.
module.exports = {
  clientId: "",
  clientSecret: "",
};
