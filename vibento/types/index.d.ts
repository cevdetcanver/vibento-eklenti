export type AyrintiAcik = boolean

declare module 'claude-code' {
  interface PluginState {
    vibento: { ayrintiAcik: StateFamily<AyrintiAcik> }
  }
}
