const path = require("node:path")
const { getDefaultConfig } = require("expo/metro-config")
const { withNativeWind } = require("nativewind/metro")

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, "../..")

const config = getDefaultConfig(projectRoot)

config.watchFolders = [
  path.resolve(workspaceRoot, "packages"),
  path.resolve(workspaceRoot, "node_modules"),
]

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
]

config.resolver.platforms = ["ios", "android", "native"]

config.resolver.blockList = [
  /\/apps\/(web|admin|auth)\/.*/,
  /\/\.next\/.*/,
  /\/dist_keycloak\/.*/,
  /\/\.turbo\/.*/,
]

module.exports = withNativeWind(config, { input: "./global.css" })
