// =====================================================================
// eklenti/vibento/hooks/esleme.ts — eşleme akışı (3g-3; sözleşme docs/sozlesme-3g-esleme.md §1, §4, §5).
//
// Jeton yoksa: kod iste (bekleyen varsa onu kullan) → açılışta ve ilk istemlerde kullanıcı kodunu göster → arka planda yokla → `tamam`da
// jetonu `$.store`'a koy. Jeton varsa: 30 günde bir yenile. Her hata sessiz (kırmızı çizgi "hook turu asla bozmaz"): tur hiç beklemez,
// ağ hatası bir sonraki olayda yeniden denenir. Cihaz kodu ve jeton hiçbir metne, uyarıya ya da günlüğe girmez.
// =====================================================================

import type { Io } from './io.ts'
import {
  ISTEMCI, SURUM, BAGLANTI_ANAHTARI, ESLEME_ANAHTARI, YAVASLA_EK_SN, ISTEM_HATIRLATMA, baglandiSatiri,
  baslatYanitiOku, teslimYanitiOku, baglantiGecerli, bekleyenGecerli, yenilemeZamani, kodSatiri,
  cihazAdiTemizle, bekleyenYoklanabilir, yoklanacakKodlar,
  KOD_ISTEK_ARALIGI_MS, KOD_ISTEK_BUTCESI_MS, KOD_ISTEK_TAVANI, KOPMA_BILDIRIMI, KOPMA_ON_SATIRI,
} from './esleme-mantik.mjs'
import { sureli } from './olay.ts'

export type Baglanti = { token: string; baglanti_id: string; sunucu: string; alindi_at: string; yenilendi_at?: string }
type Bekleyen = {
  sunucu: string; kullanici_kodu: string; cihaz_kodu: string; bitis: string; aralik: number; dogrulama_adresi: string | null
  /** Yerine yenisi istenmiş ama kullanıcının görmüş olabileceği kod: onaylanırsa teslim alınsın. */
  onceki?: { cihaz_kodu: string; bitis: string }
}

const JSON_BASLIK = { 'content-type': 'application/json' }
const YENILEME_KILIDI = 'vibento.yenileme-kilidi'

export function eslemeKur(sunucu: string) {
  let yoklayici: { cancel(): void } | null = null
  let mesgul = false
  let bekle = 0
  let istemSayaci = 0
  let baglandiDuyur: string | null = null
  let kopmaDuyur = false
  let sonKodIstegi = 0
  let kodIstekSayisi = 0

  async function baglantiOku(io: Io): Promise<Baglanti | null> {
    const k = await io.depoOku(BAGLANTI_ANAHTARI)
    return baglantiGecerli(k) && (k as Baglanti).sunucu === sunucu ? (k as Baglanti) : null
  }

  async function bekleyenOku(io: Io): Promise<Bekleyen | null> {
    const b = await io.depoOku(ESLEME_ANAHTARI)
    return bekleyenGecerli(b, sunucu, Date.now()) ? (b as Bekleyen) : null
  }

  async function cihazAdi(io: Io): Promise<string | null> {
    const oku = async (komut: string[]) => {
      try {
        const r = await io.komut(komut, 3_000)
        return r.exitCode === 0 ? cihazAdiTemizle(r.stdout) : null
      } catch {
        return null
      }
    }
    // Mac'te `hostname` iç ağ adresi dönebiliyor: o zaman bilgisayarın kendi adı (yoksa adsız, kart "Adı bildirilmemiş cihaz" der).
    return (await oku(['hostname'])) ?? (await oku(['scutil', '--get', 'ComputerName']))
  }

  async function kodIste(io: Io): Promise<Bekleyen | null> {
    const y = await io.istek(`${sunucu}/api/esleme/baslat`, {
      method: 'POST',
      headers: JSON_BASLIK,
      body: JSON.stringify({ istemci: ISTEMCI, surum: SURUM, cihaz_adi: await cihazAdi(io) }),
    })
    const r = baslatYanitiOku(y.status, y.text)
    if (r.tur !== 'kod') return null
    const eski = await io.depoOku(ESLEME_ANAHTARI)
    const b: Bekleyen = {
      sunucu, kullanici_kodu: r.kullanici_kodu, cihaz_kodu: r.cihaz_kodu, bitis: r.bitis, aralik: r.aralik, dogrulama_adresi: r.dogrulama_adresi,
      ...(bekleyenYoklanabilir(eski, sunucu, Date.now()) ? { onceki: { cihaz_kodu: (eski as Bekleyen).cihaz_kodu, bitis: (eski as Bekleyen).bitis } } : {}),
    }
    await io.depoYaz(ESLEME_ANAHTARI, b)
    return b
  }

  // MCP araçlarının kimliği (DECISIONS 2 Kas ③ Ek 2): `headersHelper` komutu bu dosyayı basar; jeton değişince dosya da değişir, araçlar kopmaz.
  // Yol sabit (`~/.vibento/`): eklentinin kök klasörü güncellemede değişir, kullanıcı düzeyi MCP tanımı da aynı dosyayı okur. Jeton yoksa `{}`.
  // Değer yalnız bu dosyaya gider (bugünkü `~/.vibento/baglanti.json` ile aynı duruş); hiçbir metne ya da günlüğe girmez. Hata sessiz.
  async function baslikYaz(io: Io, token: string | null) {
    try {
      const ev = await io.evKlasoru()
      if (!ev) return
      const a = ev.includes('\\') ? '\\' : '/'
      const yol = `${ev}${a}.vibento${a}mcp-baslik.json`
      await io.dosyaYaz(yol, JSON.stringify(token ? { Authorization: `Bearer ${token}` } : {}))
      if (a === '/') await io.komut(['chmod', '600', yol], 3_000).catch(() => null)
    } catch {
      // araçlar bir sonraki açılışa kalır; tur bozulmaz
    }
  }

  // Reddedilen jeton hâlâ depodaki mi? Başka pencere yenilediyse başlık dosyasında daha yeni jeton vardır: onu benimse, silme. Depo süreç içinde
  // önbellekli olabilir (ölçülmedi); dosya her zaman tazedir.
  async function reddedildi(io: Io, reddedilen: string) {
    try {
      const depo = await baglantiOku(io)
      if (depo && depo.token !== reddedilen) return
      const ev = await io.evKlasoru()
      if (ev && depo) {
        const a = ev.includes('\\') ? '\\' : '/'
        const m = await io.dosyaOku(`${ev}${a}.vibento${a}mcp-baslik.json`).catch(() => null)
        const dosya = m ? (JSON.parse(m) as { Authorization?: unknown }).Authorization : null
        const yeni = typeof dosya === 'string' && dosya.startsWith('Bearer ') ? dosya.slice(7) : null
        if (yeni && yeni !== reddedilen && baglantiGecerli({ ...depo, token: yeni })) {
          await io.depoYaz(BAGLANTI_ANAHTARI, { ...depo, token: yeni, yenilendi_at: new Date().toISOString() })
          return
        }
      }
    } catch {
      // okunamadı: silme yoluna düşer
    }
    await io.depoSil(BAGLANTI_ANAHTARI)
    await baslikYaz(io, null)
    kopmaDuyur = true
    try { io.bildir(KOPMA_BILDIRIMI) } catch { /* bildirim yoksa sonraki istemde satır gelir */ }
  }

  function durdur() {
    yoklayici?.cancel()
    yoklayici = null
    bekle = 0
  }

  async function yokla(io: Io) {
    if (mesgul) return
    if (bekle > 0) { bekle -= 1; return }
    mesgul = true
    try {
      if (await baglantiOku(io)) { durdur(); baglandiDuyur = baglandiSatiri(null, null); return }
      // Gösterilmeyen kod da yoklanır: kullanıcı son dakikada yazdıysa sunucu onaylı kodu bitişten sonra da teslim eder.
      const ham = await io.depoOku(ESLEME_ANAHTARI)
      if (!bekleyenYoklanabilir(ham, sunucu, Date.now())) { durdur(); return }
      const b = ham as Bekleyen
      for (const cihazKodu of yoklanacakKodlar(b, Date.now())) {
        const asil = cihazKodu === b.cihaz_kodu
        const y = await io.istek(`${sunucu}/api/esleme/jeton`, {
          method: 'POST', headers: JSON_BASLIK, body: JSON.stringify({ cihaz_kodu: cihazKodu }),
        })
        const r = teslimYanitiOku(y.status, y.text)
        if (r.tur === 'tamam') {
          const simdi = new Date().toISOString()
          await io.depoYaz(BAGLANTI_ANAHTARI, { token: r.token, baglanti_id: r.baglanti_id, sunucu, alindi_at: simdi } satisfies Baglanti)
          await io.depoSil(ESLEME_ANAHTARI)
          await baslikYaz(io, r.token)
          try { await io.mcpBagla() } catch { /* sonraki açılışta bağlanır */ }
          durdur()
          baglandiDuyur = baglandiSatiri(r.hesap_ad, r.eposta_maskeli)
          io.bildir(baglandiDuyur)
          return
        }
        if (r.tur === 'yavasla') {
          bekle = Math.ceil(YAVASLA_EK_SN / Math.max(1, b.aralik))
        } else if (r.tur === 'zaten_teslim') {
          // Başka bir pencere jetonu aldı; depo bir sonraki yoklamada okunur.
          if (!(await baglantiOku(io))) { await io.depoSil(ESLEME_ANAHTARI); durdur(); return }
        } else if (r.tur === 'bitti') {
          if (asil) { await io.depoSil(ESLEME_ANAHTARI); durdur(); return }
          const { onceki: _onceki, ...kalan } = b
          await io.depoYaz(ESLEME_ANAHTARI, kalan)
        }
      }
    } catch {
      // ağ yok: bir sonraki periyotta yeniden
    } finally {
      mesgul = false
    }
  }

  function yoklamaBaslat(io: Io, b: Bekleyen) {
    if (yoklayici) return
    yoklayici = io.herBirde(b.aralik * 1000, () => { void yokla(io) })
  }

  // Y4 (tarama 2 Kas): birkaç pencere aynı anda açılınca aynı eski jetonla yenileyebilir; kazanan dışındakiler 401 alır. Kilit yenilemeyi tek
  // pencereye indirir; 401 yalnız depodaki jeton HÂLÂ reddedilen jetonsa silme sayılır (jetonReddedildi).
  async function jetonYenile(io: Io, k: Baglanti) {
    if (!yenilemeZamani(k, Date.now())) return
    try {
      const kilit = Number(await io.depoOku(YENILEME_KILIDI))
      if (Number.isFinite(kilit) && Date.now() - kilit < 120_000) return
      await io.depoYaz(YENILEME_KILIDI, Date.now())
      const y = await io.istek(`${sunucu}/api/esleme/yenile`, {
        method: 'POST', headers: { ...JSON_BASLIK, authorization: `Bearer ${k.token}` }, body: '{}',
      })
      if (y.status === 401) { await reddedildi(io, k.token); return } // iptal, hareketsiz ya da başka pencere yeniledi
      if (!y.ok) return
      const v = JSON.parse(y.text) as { ok?: boolean; token?: unknown }
      const yeni = { ...k, token: String(v.token ?? ''), yenilendi_at: new Date().toISOString() }
      if (v.ok === true && baglantiGecerli(yeni)) { await io.depoYaz(BAGLANTI_ANAHTARI, yeni); await baslikYaz(io, yeni.token) }
    } catch {
      // sonraki açılışta yeniden
    }
  }

  return {
    baglantiOku,

    /** Açılış: bağlıysa jetonu gerekiyorsa yeniler ve null döner; değilse kodu hazırlar, yoklamayı başlatır, gösterilecek satırı döner. */
    async acilis(io: Io): Promise<string | null> {
      try {
        const k = await baglantiOku(io)
        if (k) {
          await baslikYaz(io, k.token)
          await jetonYenile(io, k)
          if (await baglantiOku(io)) return null
          // Yenileme ucu 401 verdi, bağlantı silindi: neden ve kod bu açılışta.
          return await this.istem(io)
        }
        const b = (await bekleyenOku(io)) ?? (await kodIste(io))
        if (!b) return null
        yoklamaBaslat(io, b)
        istemSayaci = 0
        return kodSatiri(b, Date.now())
      } catch {
        return null
      }
    },

    /**
     * İstem: bağlandıysa bir kez "bağlandı"; bağlı değilse kod satırı. Kod yoksa ya da süresi dolduysa açık konuşmada da yeni kod istenir
     * (2 Kas: eski kod aynı konuşmada döngüye giriyordu). Bağlantı koptuysa başına bir kez neden yazılır.
     */
    async istem(io: Io): Promise<string | null> {
      try {
        if (baglandiDuyur) { const s = baglandiDuyur; baglandiDuyur = null; return s }
        if (await baglantiOku(io)) return null
        let b = await bekleyenOku(io)
        const simdi = await io.simdi()
        if (!b && kodIstekSayisi < KOD_ISTEK_TAVANI && simdi - sonKodIstegi >= KOD_ISTEK_ARALIGI_MS) {
          sonKodIstegi = simdi
          kodIstekSayisi += 1
          // Tur beklemez: yanıt geç gelirse depoya yine yazılır, sonraki istemde görünür.
          b = await sureli(io, KOD_ISTEK_BUTCESI_MS, kodIste(io))
          if (b) istemSayaci = 0
        }
        const kopma = kopmaDuyur ? KOPMA_ON_SATIRI : null
        kopmaDuyur = false
        if (!b) return kopma
        yoklamaBaslat(io, b)
        istemSayaci += 1
        const satir = istemSayaci <= ISTEM_HATIRLATMA ? kodSatiri(b, Date.now()) : null
        return [kopma, satir].filter(Boolean).join(' ') || null
      } catch {
        return null
      }
    },

    /** Sunucu jetonu reddetti (401): başka pencere yenilemediyse sil, kopmayı duyur; sonraki istem (ya da bu açılış) yeni kod ister. */
    jetonReddedildi: reddedildi,

    durdur,
  }
}
