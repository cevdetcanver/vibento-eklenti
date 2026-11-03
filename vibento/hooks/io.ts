// =====================================================================
// eklenti/vibento/hooks/io.ts — modun dış dünyaya açılan tek arayüzü.
//
// Motor kuralı (`claude plugin validate`): `$` bir değer olarak geçirilemez, her çağrı `$.noun.event(...)` diye yazılır. Bu yüzden her
// kanca kendi `$`'ından bu arayüzü bir nesne olarak kurar (register.ts `ioKur` satırı); mantık dosyaları yalnız bu arayüzü görür ve
// testte sahtesiyle koşar.
// =====================================================================

export type IstekCevabi = { status: number; ok: boolean; text: string }
export type Zamanlayici = { cancel(): void }

export type Io = {
  depoOku(anahtar: string): Promise<unknown>
  depoYaz(anahtar: string, deger: unknown): Promise<void>
  depoSil(anahtar: string): Promise<void>
  istek(adres: string, secenek: { method?: string; headers?: Record<string, string>; body?: string }): Promise<IstekCevabi>
  komut(argv: string[], zamanAsimiMs: number): Promise<{ exitCode: number | null; stdout: string }>
  herBirde(ms: number, fn: () => void): Zamanlayici
  sonra(ms: number, fn: () => void): Zamanlayici
  bildir(metin: string): void
  simdi(): Promise<number>
  dosyaBoyu(yol: string): Promise<number | null>
  dizin(yol: string): Promise<{ name: string; kind: string; size: number; mtimeMs: number }[]>
  istemGonder(metin: string): Promise<unknown>
  evKlasoru(): Promise<string | null>
  sistemKlasoru(): Promise<string | null>
  dosyaYaz(yol: string, metin: string): Promise<void>
  dosyaOku(yol: string): Promise<string>
  mcpBagla(): Promise<void>
}
