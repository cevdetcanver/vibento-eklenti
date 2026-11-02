// =====================================================================
// eklenti/vibento/hooks/esleme.ts — eşleme akışı (3g-3; sözleşme docs/sozlesme-3g-esleme.md §1, §4, §5).
//
// Jeton yoksa: kod iste (bekleyen varsa onu kullan) → açılışta ve ilk istemlerde kullanıcı kodunu göster → arka planda yokla → `tamam`da
// jetonu `$.store`'a koy. Jeton varsa: 30 günde bir yenile. Her hata sessiz (kırmızı çizgi "hook turu asla bozmaz"): tur hiç beklemez,
// ağ hatası bir sonraki olayda yeniden denenir. Cihaz kodu ve jeton hiçbir metne, uyarıya ya da günlüğe girmez.
// =====================================================================

import type { Io } from './io.ts'
import {
  ISTEMCI, SURUM, BAGLANTI_ANAHTARI, ESLEME_ANAHTARI, YAVASLA_EK_SN, ISTEM_HATIRLATMA, BAGLANDI_SATIRI,
  baslatYanitiOku, teslimYanitiOku, baglantiGecerli, bekleyenGecerli, yenilemeZamani, kodSatiri,
} from './esleme-mantik.mjs'

export type Baglanti = { token: string; baglanti_id: string; sunucu: string; alindi_at: string; yenilendi_at?: string }
type Bekleyen = {
  sunucu: string; kullanici_kodu: string; cihaz_kodu: string; bitis: string; aralik: number; dogrulama_adresi: string | null
}

const JSON_BASLIK = { 'content-type': 'application/json' }

export function eslemeKur(sunucu: string) {
  let yoklayici: { cancel(): void } | null = null
  let mesgul = false
  let bekle = 0
  let istemSayaci = 0
  let baglandiDuyur = false

  async function baglantiOku(io: Io): Promise<Baglanti | null> {
    const k = await io.depoOku(BAGLANTI_ANAHTARI)
    return baglantiGecerli(k) && (k as Baglanti).sunucu === sunucu ? (k as Baglanti) : null
  }

  async function bekleyenOku(io: Io): Promise<Bekleyen | null> {
    const b = await io.depoOku(ESLEME_ANAHTARI)
    return bekleyenGecerli(b, sunucu, Date.now()) ? (b as Bekleyen) : null
  }

  async function cihazAdi(io: Io): Promise<string | null> {
    try {
      const r = await io.komut(["hostname"], 3_000)
      const ad = r.exitCode === 0 ? r.stdout.trim().slice(0, 80) : ''
      return ad || null
    } catch {
      return null
    }
  }

  async function kodIste(io: Io): Promise<Bekleyen | null> {
    const y = await io.istek(`${sunucu}/api/esleme/baslat`, {
      method: 'POST',
      headers: JSON_BASLIK,
      body: JSON.stringify({ istemci: ISTEMCI, surum: SURUM, cihaz_adi: await cihazAdi(io) }),
    })
    const r = baslatYanitiOku(y.status, y.text)
    if (r.tur !== 'kod') return null
    const b: Bekleyen = {
      sunucu, kullanici_kodu: r.kullanici_kodu, cihaz_kodu: r.cihaz_kodu, bitis: r.bitis, aralik: r.aralik, dogrulama_adresi: r.dogrulama_adresi,
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
      await io.dosyaYaz(`${ev}${a}.vibento${a}mcp-baslik.json`, JSON.stringify(token ? { Authorization: `Bearer ${token}` } : {}))
    } catch {
      // araçlar bir sonraki açılışa kalır; tur bozulmaz
    }
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
      if (await baglantiOku(io)) { durdur(); baglandiDuyur = true; return }
      const b = await bekleyenOku(io)
      if (!b) { durdur(); return }
      const y = await io.istek(`${sunucu}/api/esleme/jeton`, {
        method: 'POST', headers: JSON_BASLIK, body: JSON.stringify({ cihaz_kodu: b.cihaz_kodu }),
      })
      const r = teslimYanitiOku(y.status, y.text)
      if (r.tur === 'tamam') {
        const simdi = new Date().toISOString()
        await io.depoYaz(BAGLANTI_ANAHTARI, { token: r.token, baglanti_id: r.baglanti_id, sunucu, alindi_at: simdi } satisfies Baglanti)
        await io.depoSil(ESLEME_ANAHTARI)
        await baslikYaz(io, r.token)
        try { await io.mcpBagla() } catch { /* sonraki açılışta bağlanır */ }
        durdur()
        baglandiDuyur = true
        io.bildir('Vibento: bu bilgisayar bağlandı.')
      } else if (r.tur === 'yavasla') {
        bekle = Math.ceil(YAVASLA_EK_SN / Math.max(1, b.aralik))
      } else if (r.tur === 'zaten_teslim') {
        // Başka bir pencere jetonu aldı; depo bir sonraki yoklamada okunur.
        if (!(await baglantiOku(io))) { await io.depoSil(ESLEME_ANAHTARI); durdur() }
      } else if (r.tur === 'bitti') {
        await io.depoSil(ESLEME_ANAHTARI)
        durdur()
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

  async function jetonYenile(io: Io, k: Baglanti) {
    if (!yenilemeZamani(k, Date.now())) return
    try {
      const y = await io.istek(`${sunucu}/api/esleme/yenile`, {
        method: 'POST', headers: { ...JSON_BASLIK, authorization: `Bearer ${k.token}` }, body: '{}',
      })
      if (y.status === 401) { await io.depoSil(BAGLANTI_ANAHTARI); await baslikYaz(io, null); return } // iptal ya da hareketsiz: yeniden eşleme
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
        if (k) { await baslikYaz(io, k.token); await jetonYenile(io, k); return null }
        const b = (await bekleyenOku(io)) ?? (await kodIste(io))
        if (!b) return null
        yoklamaBaslat(io, b)
        istemSayaci = 0
        return kodSatiri(b, Date.now())
      } catch {
        return null
      }
    },

    /** İstem: bağlandıysa bir kez "bağlandı"; bekleyen kod varsa ilk birkaç istemde kod satırı. */
    async istem(io: Io): Promise<string | null> {
      try {
        if (baglandiDuyur) { baglandiDuyur = false; return BAGLANDI_SATIRI }
        if (await baglantiOku(io)) return null
        const b = await bekleyenOku(io)
        if (!b) return null
        yoklamaBaslat(io, b)
        istemSayaci += 1
        return istemSayaci <= ISTEM_HATIRLATMA ? kodSatiri(b, Date.now()) : null
      } catch {
        return null
      }
    },

    /** Sunucu jetonu reddetti (401): depodan sil, sonraki açılış yeni kod ister. */
    async jetonReddedildi(io: Io) {
      await io.depoSil(BAGLANTI_ANAHTARI)
      await baslikYaz(io, null)
    },

    durdur,
  }
}
