// 在 webpack.config.base.ts 的 webpack.EnvironmentPlugin 中注册的变量，
// 在编译时 webpack 会根据环境变量替换掉 process.env.XXX

export const CHATBOX_BUILD_TARGET = (process.env.CHATBOX_BUILD_TARGET || 'unknown') as 'unknown' | 'mobile_app'
export const CHATBOX_BUILD_PLATFORM = (process.env.CHATBOX_BUILD_PLATFORM || 'unknown') as
  | 'unknown'
  | 'ios'
  | 'android'
  | 'web'

// api.chatboxai.app
export const USE_LOCAL_API = process.env.USE_LOCAL_API || ''
export const USE_BETA_API = process.env.USE_BETA_API || ''

// chatboxai.app
export const USE_LOCAL_CHATBOX = process.env.USE_LOCAL_CHATBOX || ''
export const USE_BETA_CHATBOX = process.env.USE_BETA_CHATBOX || ''

export const NODE_ENV = process.env.NODE_ENV || 'development'

/**
 * 是否配置了自家更新源（构建期由 electron.vite.config.ts 注入）。
 *
 * 未配置（默认）时：
 * - 主进程不会发起任何更新检查（见 src/main/app-updater.ts）；
 * - 设置页不展示「自动更新 / Beta 更新」开关，避免用户误以为可更新。
 */
export const AUTO_UPDATE_ENABLED = Boolean(process.env.PATENTHUB_UPDATE_URL)
