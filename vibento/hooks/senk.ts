// =====================================================================
// eklenti/vibento/hooks/senk.ts — sohbet kaydını (transkript) `/api/senk`'e eşitler (3g-3c; bugünkü kanca 04-senkron.mjs senkYap).
//
// Değişmezler: 6 (ofset makinede tutulmaz; tek doğru sunucunun senk_ofset'i) · 8 (dosya asla bütün okunmaz; satır sınırında kesilen
// pencereler) · metin kancanın süzgecinden geçer (gizliSuz, ayrıştırıcının içinde). Pencere işletim sisteminin aracıyla (senk-mantik.mjs).
// Bir pencerede LF yoksa (tek satır pencere tavanından uzun): satırın sonu ileride aranır ve o aralık mesajsız bir parçayla geçilir
// (hatali +1); yoksa senkron o satırda sonsuza dek takılırdı.
// =====================================================================

import type { Io } from './io.ts'
import {
  PENCERE_VARSAYILAN, PENCERE_TAVANI, base64Coz, pencereKomutu, pencereKes, senkParcalaraBol, parcaDurumlariKur, senkGovdesiTemizle,
} from './senk-mantik.mjs'
import { satirlariAyristir, gizliSuz, maliyetHesapla, VIBENTO_FIYAT } from './gunluk.mjs'
import { HOOK_SURUM, pencereAdiAl } from './olay-mantik.mjs'

type Durum = Record<string, unknown> & { son_sira?: unknown; son_mesaj_id?: unknown; arac_adlari?: unknown; yerel_mesaj?: unknown; sayac?: unknown }
type Mesaj = Record<string, unknown> & { _ofset: number; sira: number; metin?: string; _suzulen?: number }
type Parca = { bas: number; son: number; sira: number | null; suzulen: number; sonMu: boolean; mesajlar: Mesaj[]; durum?: Durum }
type Pencere = { tampon: Uint8Array; bas: number; son: number }

export type SenkOzeti = { mesaj: number; parca: number; ofset: number; hata: string | null; kod: number }

const ayristir = (metin: string, sira: number, durum: Durum) =>
  satirlariAyristir(metin, sira, { durum, gizliSuz, maliyetHesapla, fiyatTablosu: VIBENTO_FIYAT }) as unknown as {
    mesajlar: Mesaj[]; durum: Durum; suzulen: number; hatali: number; suzulenTurler: Record<string, number>; pencereAdi?: string
  }

export function senkKur(sunucu: string) {
  const suren = new Set<string>()
  const istek = (io: Io, token: string, yol: string, yontem: string, govde: unknown, ms: number) =>
    istekYap(io, sunucu, token, yol, yontem, govde, ms)

  return {
    senkYap: async (io: Io, token: string, dosya: unknown, disSeansId: unknown, cwd: unknown, butceMs: number) =>
      senkYapIc(io, istek, suren, token, dosya, disSeansId, cwd, butceMs),
  }
}

export type Istek = (io: Io, token: string, yol: string, yontem: string, govde: unknown, ms: number) =>
  Promise<{ ok: boolean; kod: number; govde: Record<string, unknown> | null }>

/** Sunucuya istek (süre sınırlı, `$.clock.after` yarışı). Hiç fırlatmaz: hata `{ ok:false, kod:0 }`. */
export async function istekYap(io: Io, sunucu: string, token: string, yol: string, yontem: string, govde: unknown, ms: number) {
  let zaman: { cancel(): void } | null = null
  try {
    const sure = Math.max(300, Math.min(ms, 8_000))
    const y = await Promise.race([
      io.istek(`${sunucu}${yol}`, {
        method: yontem,
        headers: govde === null ? { authorization: `Bearer ${token}` } : { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: govde === null ? undefined : JSON.stringify(govde),
      }),
      new Promise<null>((coz) => { zaman = io.sonra(sure, () => coz(null)) }),
    ])
    if (!y) return { ok: false, kod: 0, govde: null as Record<string, unknown> | null }
    let icerik: Record<string, unknown> | null = null
    try { icerik = JSON.parse(y.text) as Record<string, unknown> } catch { icerik = null }
    return { ok: y.ok, kod: y.status, govde: icerik }
  } catch {
    return { ok: false, kod: 0, govde: null as Record<string, unknown> | null }
  } finally {
    ;(zaman as { cancel(): void } | null)?.cancel()
  }
}

/** Dosyanın [bas, bas+uzunluk) baytları (işletim sisteminin aracıyla) ya da null. */
export async function dosyaOku(io: Io, dosya: string, bas: number, uzunluk: number): Promise<Uint8Array | null> {
  const argv = pencereKomutu(dosya, bas, uzunluk)
  if (!argv) return null
  const r = await io.komut(argv, 20_000)
  if (r.exitCode !== 0) return null
  return base64Coz(r.stdout.trim())
}

const oku = dosyaOku

/**
 * Satır sınırında biten pencere; LF yoksa pencere büyür (tavana kadar). Tavanda da LF yoksa { uzun: satır sonu ofseti | null }.
 * `ilk`: ilk pencere boyu (alt ajan ölçümü 1000 satırı aşınca yarıya indirir).
 */
export async function pencereOku(io: Io, dosya: string, bas: number, boy: number, ilk = PENCERE_VARSAYILAN):
  Promise<Pencere | { uzun: number | null } | null> {
  {
    if (bas >= boy) return null
    let uzunluk = Math.max(1, Math.min(ilk, boy - bas))
    for (;;) {
      const bayt = await oku(io, dosya, bas, uzunluk)
      if (!bayt || bayt.length === 0) return null
      const p = pencereKes(bayt, bas)
      if (p) return p
      if (bas + bayt.length >= boy) return null // son satır henüz tamamlanmadı
      if (uzunluk >= PENCERE_TAVANI) break
      uzunluk = Math.min(uzunluk * 2, PENCERE_TAVANI, boy - bas)
    }
    // Tavandan uzun tek satır: sonunu ileride ara.
    let imlec = bas + PENCERE_TAVANI
    while (imlec < boy) {
      const bayt = await oku(io, dosya, imlec, Math.min(PENCERE_TAVANI, boy - imlec))
      if (!bayt || bayt.length === 0) return { uzun: null }
      const i = bayt.indexOf(10)
      if (i !== -1) return { uzun: imlec + i + 1 }
      imlec += bayt.length
    }
    return { uzun: null }
  }
}

/** Bir dosyayı bütçe içinde eşitler. Aynı dosya için ikinci çağrı (önceki sürerken) hiçbir şey yapmaz. */
async function senkYapIc(io: Io, istek: Istek, suren: Set<string>, token: string, dosya: unknown, disSeansId: unknown, cwd: unknown,
  butceMs: number): Promise<SenkOzeti> {
  {
    {
      const ozet: SenkOzeti = { mesaj: 0, parca: 0, ofset: 0, hata: null, kod: 0 }
      if (typeof dosya !== 'string' || dosya.length === 0) { ozet.hata = 'transkript yolu yok'; return ozet }
      if (suren.has(dosya)) { ozet.hata = 'zaten suruyor'; return ozet }
      suren.add(dosya)
      const baslangic = await io.simdi()
      const kalan = async () => butceMs - ((await io.simdi()) - baslangic)
      try {
        const boy = await io.dosyaBoyu(dosya)
        if (boy === null) { ozet.hata = 'transkript dosyasi bulunamadi'; return ozet }
        const bas = await istek(io, token, `/api/senk?dosya=${encodeURIComponent(dosya)}`, 'GET', null, await kalan())
        if (!bas.ok || !bas.govde) { ozet.hata = `ofset alinamadi (HTTP ${bas.kod})`; ozet.kod = bas.kod; return ozet }
        let ofset = Number(bas.govde.ofset)
        if (!Number.isFinite(ofset) || ofset < 0) ofset = 0
        let durum: Durum = bas.govde.ayristirici_durumu && typeof bas.govde.ayristirici_durumu === 'object'
          ? bas.govde.ayristirici_durumu as Durum : {}
        if (ofset > boy) ofset = 0
        ozet.ofset = ofset
        const suzulenTurlerToplam: Record<string, number> = {}
        let sonPencereAdi: string | null = null
        let imlec = ofset
        let dur = false
        while (!dur && imlec < boy) {
          if ((await kalan()) <= 500) { ozet.hata = 'butce doldu'; break }
          const pnc = await pencereOku(io, dosya, imlec, boy)
          if (!pnc) break
          if ('uzun' in pnc) {
            if (pnc.uzun === null) break
            // Okunamayacak kadar uzun tek satır: mesajsız parçayla geçilir (hatalı sayılır).
            const y = await istek(io, token, '/api/senk', 'POST', {
              dosya, dis_seans_id: disSeansId, cwd, baslangic_ofset: imlec, bitis_ofset: pnc.uzun,
              ayristirici_durumu: { son_sira: durum.son_sira, son_mesaj_id: durum.son_mesaj_id, arac_adlari: durum.arac_adlari },
              suzulen: 0, hatali: 1, hook_surum: HOOK_SURUM, yerel_boyut: boy, mesajlar: [],
            }, await kalan())
            if (!y.ok) { ozet.kod = y.kod; ozet.hata = `uzun satir gecilemedi (HTTP ${y.kod})`; break }
            imlec = pnc.uzun
            continue
          }
          const baslangicSira = Number.isFinite(Number(durum.son_sira)) ? Number(durum.son_sira) : 0
          const pencereBasDurum = durum
          const cozum = ayristir(new TextDecoder('utf-8').decode(pnc.tampon), baslangicSira, durum)
          durum = cozum.durum
          ozet.mesaj += cozum.mesajlar.length
          for (const tur of Object.keys(cozum.suzulenTurler ?? {})) {
            suzulenTurlerToplam[tur] = (suzulenTurlerToplam[tur] ?? 0) + (cozum.suzulenTurler[tur] ?? 0)
          }
          if (typeof cozum.pencereAdi === 'string') sonPencereAdi = cozum.pencereAdi
          const gidecekAd = pencereAdiAl(sonPencereAdi)
          let tavanMesaj = 300
          let tavanBayt = 800_000
          let parcalar = senkParcalaraBol(cozum.mesajlar, pnc.bas, pnc.son, tavanMesaj, tavanBayt) as Parca[]
          parcaDurumlariKur(parcalar, 0, pnc, pencereBasDurum, cozum.durum, ayristir)
          let i = 0
          while (i < parcalar.length) {
            if ((await kalan()) <= 500) { ozet.hata = 'butce doldu'; dur = true; break }
            const parca = parcalar[i] as Parca
            const pd = parca.durum ?? durum
            const gonderilecek: Durum = { son_sira: parca.sira === null ? pd.son_sira : parca.sira, son_mesaj_id: pd.son_mesaj_id, arac_adlari: pd.arac_adlari }
            if (pd.yerel_mesaj && typeof pd.yerel_mesaj === 'object') gonderilecek.yerel_mesaj = pd.yerel_mesaj
            if (parca.sonMu) { gonderilecek.sayac = durum.sayac; gonderilecek.suzulen_turler = suzulenTurlerToplam }
            const govde: Record<string, unknown> = {
              dosya, dis_seans_id: disSeansId, cwd, baslangic_ofset: parca.bas, bitis_ofset: parca.son, ayristirici_durumu: gonderilecek,
              suzulen: parca.suzulen, hatali: parca.sonMu ? cozum.hatali : 0, hook_surum: HOOK_SURUM, yerel_boyut: boy,
              mesajlar: parca.mesajlar.map(senkGovdesiTemizle),
            }
            if (gidecekAd !== null) govde.pencere_adi = gidecekAd
            const y = await istek(io, token, '/api/senk', 'POST', govde, await kalan())
            if (!y.ok) {
              ozet.kod = y.kod
              if (y.kod === 413 && tavanMesaj > 12) {
                tavanMesaj = Math.max(12, Math.floor(tavanMesaj / 4))
                tavanBayt = Math.max(60_000, Math.floor(tavanBayt / 4))
                const kalanMesajlar: Mesaj[] = []
                for (let j = i; j < parcalar.length; j += 1) for (const m of (parcalar[j] as Parca).mesajlar) kalanMesajlar.push(m)
                const yeniler = senkParcalaraBol(kalanMesajlar, pnc.bas, pnc.son, tavanMesaj, tavanBayt) as Parca[]
                ;(yeniler[0] as Parca).bas = parca.bas
                parcalar = parcalar.slice(0, i).concat(yeniler)
                parcaDurumlariKur(parcalar, i, pnc, pencereBasDurum, cozum.durum, ayristir)
                continue
              }
              ozet.hata = `parca gonderilemedi (HTTP ${y.kod})`
              dur = true
              break
            }
            ozet.parca += 1
            ozet.ofset = y.govde && typeof y.govde.ofset === 'number' ? y.govde.ofset : parca.son
            i += 1
          }
          imlec = pnc.son
        }
        return ozet
      } catch {
        ozet.hata = 'beklenmeyen hata'
        return ozet
      } finally {
        suren.delete(dosya)
      }
    }
  }
}
