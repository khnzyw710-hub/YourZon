const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Support Porcupine wake word model files (.ppn) and voice model files (.pv)
config.resolver.assetExts.push('ppn', 'pv');

module.exports = config;
