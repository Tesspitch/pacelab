const { withAppBuildGradle } = require('expo/config-plugins');

const CMAKE_PATH_LIMIT = '-DCMAKE_OBJECT_PATH_MAX=128';

module.exports = function withWindowsCmakeObjectPathLimit(config) {
  if (process.platform !== 'win32') {
    return config;
  }

  return withAppBuildGradle(config, (config) => {
    const { contents } = config.modResults;
    if (contents.includes(CMAKE_PATH_LIMIT)) {
      return config;
    }

    const defaultConfig = '    defaultConfig {';
    if (!contents.includes(defaultConfig)) {
      throw new Error('Could not find the Android defaultConfig block in app/build.gradle.');
    }

    config.modResults.contents = contents.replace(
      defaultConfig,
      `${defaultConfig}
        externalNativeBuild {
            cmake {
                arguments "${CMAKE_PATH_LIMIT}"
            }
        }`,
    );
    return config;
  });
};
