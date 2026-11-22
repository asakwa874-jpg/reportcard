// Paste your Firebase web app settings here.
// Firebase console > Project settings (gear icon) > General > "Your apps" > Web app (</>) > "SDK setup and configuration" > Config.
// These values are not secrets: the security rules in firestore.rules protect the data.
export const firebaseConfig = {
  apiKey: "PASTE_API_KEY",
  authDomain: "reportcard-dds.firebaseapp.com",
  projectId: "reportcard-dds",
  storageBucket: "reportcard-dds.firebasestorage.app",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID",
};

// Your business details shown on the sign-in screen and report cards footer.
export const business = { name: "DDS Digital Solution", phone: "+237677098735" };
