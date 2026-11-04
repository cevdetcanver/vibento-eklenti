export type AyrintiAcik = boolean
export type VerilenCevap = string
export type Secimler = Record<string, string[]>
export type KartPencere = { ad: string; ajan: string | null; renk: string | null } | null
export type SonSoru = string
export type MesajliTur = boolean

declare module 'claude-code' {
  interface PluginState {
    vibento: {
      ayrintiAcik: StateFamily<AyrintiAcik>
      verilenCevap: StateFamily<VerilenCevap>
      secimler: StateFamily<Secimler>
      kartPencere: KartPencere
      sonSoru: SonSoru
      mesajliTur: MesajliTur
    }
  }
}
