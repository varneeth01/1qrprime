const { withProjectBuildGradle, withGradleProperties } = require("@expo/config-plugins");

const NDK_VERSION = "27.0.12077973";
const BUILD_TOOLS_VERSION = "36.1.0";

module.exports = function withAndroidToolchain(config) {
  config = withProjectBuildGradle(config, (project) => {
    if (project.modResults.language === "groovy") {
      const marker = 'apply plugin: "expo-root-project"';
      const values = `ext.ndkVersion = "${NDK_VERSION}"\next.buildToolsVersion = "${BUILD_TOOLS_VERSION}"\n`;
      if (!project.modResults.contents.includes("ext.ndkVersion")) {
        project.modResults.contents = project.modResults.contents.replace(marker, `${values}\n${marker}`);
      }
    }
    return project;
  });
  return withGradleProperties(config, (properties) => {
    const set = (key, value) => {
      const existing = properties.modResults.find((item) => item.type === "property" && item.key === key);
      if (existing) existing.value = value;
      else properties.modResults.push({ type: "property", key, value });
    };
    set("android.ndkVersion", NDK_VERSION);
    set("android.buildToolsVersion", BUILD_TOOLS_VERSION);
    return properties;
  });
};
