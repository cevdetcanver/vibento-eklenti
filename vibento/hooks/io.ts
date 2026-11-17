// =====================================================================
// eklenti/vibento/hooks/io.ts — modun dış dünyaya açılan tek arayüzü.
//
// Motor kuralı (`claude plugin validate`): `$` bir değer olarak geçirilemez, her çağrı `$.noun.event(...)` diye yazılır. Bu yüzden her
// kanca kendi `$`'ından bu arayüzü bir nesne olarak kurar (register.ts `ioKur` satırı); mantık dosyaları yalnız bu arayüzü görür ve
// testte sahtesiyle koşar.
// =====================================================================

export type IstekCevabi = { status: number; ok: boolean; text: string }
/** `komut`'un üçüncü argümanı; verilmeyen (ya da null) alan `$.process.run`'a hiç geçmez. */
export type KomutSecenegi = { girdi?: string | null; ortam?: Record<string, string> | null }

/**
 * `$.process.run`'ın seçenek nesnesi: süre ve çalışma klasörü her zaman; `stdin` ve `env` YALNIZ verildiyse (anahtar bile konmaz:
 * öbür komutlar bugünkü seçeneklerle bayt bayt aynı koşar). Saf; `register.ts`'in beş `komut:` kurucusu bunu kullanır.
 */
export function komutSecenegi(zamanAsimiMs: number, cwd: string | undefined, secenek?: KomutSecenegi) {
  const cikti: { timeoutMs: number; cwd: string | undefined; stdin?: string; env?: Record<string, string> } = { timeoutMs: zamanAsimiMs, cwd }
  if (typeof secenek?.girdi === 'string') cikti.stdin = secenek.girdi
  if (secenek?.ortam && typeof secenek.ortam === 'object') cikti.env = secenek.ortam
  return cikti
}
export type Zamanlayici = { cancel(): void }

export type Io = {
  depoOku(anahtar: string): Promise<unknown>
  depoYaz(anahtar: string, deger: unknown): Promise<void>
  depoSil(anahtar: string): Promise<void>
  istek(adres: string, secenek: { method?: string; headers?: Record<string, string>; body?: string }): Promise<IstekCevabi>
  /**
   * Kabuksuz komut. `secenek.girdi`: standart girdiye yazılır, sonra kapatılır. `secenek.ortam`: sürecin ortamına EKLENİR (yalnız o
   * çocuk için). İkisi de yalnız okuma komutunda kullanılır (`senk.ts` `dosyaOku`; `docs/sozlesme-okuma-komutu.md`).
   */
  komut(argv: string[], zamanAsimiMs: number, secenek?: KomutSecenegi): Promise<{ exitCode: number | null; stdout: string }>
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
  /** Arka plan pencereler (arka-plan.ts): kabuksuz süreç, çıktısı parça parça, sonu çıkış kodu. Kurulmadığı kancada yok. */
  surec?(argv: string[], cwd: string, env: Record<string, string>): Surec
  /** İstem kutusunun altındaki eklenti satırı (sürüm; surum-mantik.mjs). Kurulmadığı kancada yok. */
  durum?(metin: string): void
  /** Ortam değişkeni (ikili dosyanın yolu, arka plan işareti). */
  ortam?(ad: string): Promise<string | null | undefined>
}

export type SurecParcasi = { stream: string; text: string }
export type SurecSonucu = { code: number | null; signal?: string | null }
export type Surec = AsyncIterator<SurecParcasi, SurecSonucu> & Partial<AsyncIterable<SurecParcasi>>
