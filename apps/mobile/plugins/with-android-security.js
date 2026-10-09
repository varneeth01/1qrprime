const { withAndroidManifest } = require("@expo/config-plugins");

/** Keep release builds from enabling local-network transport or app-data backup. */
module.exports = function withAndroidSecurity(config) {
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (application) {
      application.$["android:allowBackup"] = "false";
      application.$["android:usesCleartextTraffic"] = "false";
    }
    return mod;
  });
};
