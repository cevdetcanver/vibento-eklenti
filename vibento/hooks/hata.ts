// =====================================================================
// eklenti/vibento/hooks/hata.ts — kancaların hata kapısının (`on(...).catch`) ortak gövdesi (0.1.28; sözleşme docs/sozlesme-kanca-hatasi.md §2.2).
//
// Kapı iki iş görür: (1) VAR OLMASI eklentiyi yüklü tutar (işçi kaybında `.catch`'siz kancanın eklentisi boşaltılır; 19 Kas ölçümü),
// (2) nedeni depoya yazar; kayıt sıradaki olayla sunucuya gider (`olay.ts`). Ağ yok, metin yok. Kapının kendi süresi 1 sn'dir (motor).
// =====================================================================

import { hataAnahtari, hataEkle, hataKaydi } from './hata-mantik.mjs'

export type HataIo = { depoOku: (k: string) => Promise<unknown>; depoYaz: (k: string, v: unknown) => Promise<unknown> }
export type KancaHatasi = { readonly kind: string; readonly message?: unknown }

// Aynı kanca art arda düşerse (ör. her çizimde atan bir çizim kancası) depo her seferinde yazılmasın: eklentinin bu kopyası başına sınır.
// İşçi yenilenince kopya da yenilenir, sayaç sıfırlanır.
export const KOPYA_BASINA_TAVAN = 5
const yazilan = new Map<string, number>()

/** Hata kaydını oturumun depo anahtarına ekler. Hiçbir hata fırlatmaz. */
export async function hataYaz(io: HataIo, seansId: unknown, kanca: string, hata: KancaHatasi | undefined, cagrildi: boolean): Promise<void> {
  try {
    const sayi = yazilan.get(kanca) ?? 0
    if (sayi >= KOPYA_BASINA_TAVAN) return
    const anahtar = hataAnahtari(seansId)
    const kayit = hataKaydi(kanca, hata, cagrildi, Date.now())
    if (!anahtar || !kayit) return
    yazilan.set(kanca, sayi + 1)
    await io.depoYaz(anahtar, hataEkle(await io.depoOku(anahtar), kayit))
  } catch {
    // kayıt yazılamadı: kapı yine yanıt verir, eklenti yüklü kalır
  }
}

/** Kapının yanıtı: altın (motorun ve alttaki eklentilerin) sonucu; o da düştüyse kanca yok sayılır (`undefined`; motor altı kendisi koşar). */
export async function altinSonucu<T>(is: () => Promise<T> | T): Promise<T> {
  try {
    return await is()
  } catch {
    return undefined as never
  }
}
