// =====================================================================
// eklenti/vibento/hooks/altajan.ts — alt ajan ölçümü (3g-3c ②; bugünkü kanca 06-alt-ajan-adlar.mjs altAjanCanli, sözleşme dilim3b §3-4).
//
// Claude Code alt ajan kayıtlarını `<proje>/<ana oturum>/subagents/**/agent-<id>.jsonl` yazar. Tel üzerine YALNIZ ÖLÇÜM çıkar (uuid,
// zaman, token kırılımı, model, hız, bölge): metin, araç adı ve araç sonucu gitmez (değişmez 9). Ofsetler sunucuda (toplu uç).
// Fark: kancada Stop'ta ≤ 2,5 sn turu bekletiyordu; eklentide arka planda koşar (bütçe çağırandan).
// =====================================================================

import type { Io } from './io.ts'
import { satirlariAyristir, maliyetHesapla, VIBENTO_FIYAT } from './gunluk.mjs'
import { HOOK_SURUM } from './olay-mantik.mjs'
import { pencereOku, dosyaOku, type Istek } from './senk.ts'
import { PENCERE_VARSAYILAN } from './senk-mantik.mjs'

const ALT_AJAN_DOSYA = /^agent-(.+)\.jsonl$/i
const ALT_AJAN_YOL_TAVANI = 1000
const ALT_AJAN_OFSET_PARCA = 500
const ALT_AJAN_PARCA_SATIR = 1000

type Kaynak = { dosya: string; dosya_kimligi: string; is_akisi: string | null; boyut: number; degisti: number }
type Baslangic = { ofset: number; durum: Record<string, unknown> }

/** Yol ayracı transkriptin kendisinden (Windows `\`, diğerleri `/`). */
function ayrac(yol: string) { return yol.includes('\\') && !yol.includes('/') ? '\\' : yol.includes('\\') ? '\\' : '/' }
function ustKlasor(yol: string) { const i = Math.max(yol.lastIndexOf('/'), yol.lastIndexOf('\\')); return i > 0 ? yol.slice(0, i) : yol }

async function dosyalariBul(io: Io, kok: string, a: string): Promise<Kaynak[]> {
  const sonuc: Kaynak[] = []
  const gez = async (klasor: string, yol: string[], derinlik: number) => {
    if (derinlik > 6) return
    let girdiler: Awaited<ReturnType<Io['dizin']>> = []
    try { girdiler = await io.dizin(klasor) } catch { return }
    for (const g of girdiler) {
      const tam = `${klasor}${a}${g.name}`
      if (g.kind === 'dir') { await gez(tam, yol.concat([g.name]), derinlik + 1); continue }
      const m = g.kind === 'file' ? ALT_AJAN_DOSYA.exec(g.name) : null
      if (!m) continue
      const akisYeri = yol.indexOf('workflows')
      const akis = akisYeri !== -1 && yol.length > akisYeri + 1 ? yol[akisYeri + 1] ?? null : null
      sonuc.push({ dosya: tam, dosya_kimligi: m[1] ?? '', is_akisi: akis && akis.length <= 80 ? akis : null, boyut: g.size, degisti: g.mtimeMs })
    }
  }
  await gez(kok, [], 0)
  return sonuc
}

/** Alt ajanın kimliği dosyanın başındaki satırlardan (agentId; en çok 1 MB), yoksa dosya adındaki kimlik. */
async function altAjanKimligi(io: Io, dosya: string, boy: number, yedek: string): Promise<string> {
  try {
    const bayt = await dosyaOku(io, dosya, 0, Math.min(boy, 1_048_576))
    if (!bayt) return yedek
    const metin = new TextDecoder('utf-8').decode(bayt)
    let i = metin.indexOf('"agentId"')
    while (i !== -1) {
      const bas = metin.lastIndexOf('\n', i) + 1
      let son = metin.indexOf('\n', i)
      if (son === -1) son = metin.length
      try {
        const k = JSON.parse(metin.slice(bas, son)) as { agentId?: unknown }
        const kimlik = typeof k.agentId === 'string' ? k.agentId.trim() : ''
        if (kimlik.length > 0 && kimlik.length <= 80) return kimlik
      } catch { /* bozuk satır: sonraki */ }
      i = metin.indexOf('"agentId"', son)
    }
  } catch { /* dosya adındaki kimlik */ }
  return yedek
}

type Mesaj = { uuid: unknown; zaman: unknown; girdi_token: unknown; cikti_token: unknown; cache_okuma: unknown; cache_yazma: unknown;
  cache_yazma_1s: unknown; _model: unknown; hiz: unknown; bolge: unknown }
const olcum = (m: Mesaj) => ({
  uuid: m.uuid, zaman: m.zaman, girdi_token: m.girdi_token, cikti_token: m.cikti_token, cache_okuma: m.cache_okuma,
  cache_yazma: m.cache_yazma, cache_yazma_1s: m.cache_yazma_1s, _model: m._model, hiz: m.hiz, bolge: m.bolge,
})

async function dosyaGonder(io: Io, istek: Istek, token: string, kaynak: Kaynak & { alt_ajan: string; dis_seans_id: string },
  bas: Baslangic, kalan: () => Promise<number>): Promise<'tamam' | 'dur' | 'catisma' | 'hatali'> {
  let ofset = bas.ofset
  let durum = bas.durum
  const boy = await io.dosyaBoyu(kaynak.dosya)
  if (boy === null) return 'hatali'
  if (ofset > boy) { ofset = 0; durum = {} }
  let pencere = PENCERE_VARSAYILAN
  let imlec = ofset
  const gorulen = new Set<unknown>()
  for (;;) {
    if ((await kalan()) <= 500) return 'dur'
    const pnc = await pencereOku(io, kaynak.dosya, imlec, boy, pencere)
    if (!pnc || 'uzun' in pnc) return 'tamam' // ölçüm satırı pencereden uzun olmaz; uzun satır bir sonraki ana senkron kuralına kalır
    const metin = new TextDecoder('utf-8').decode(pnc.tampon)
    const sira = Number.isFinite(Number(durum.son_sira)) ? Number(durum.son_sira) : 0
    const cozum = satirlariAyristir(metin, sira, { durum, gizliSuz: null, maliyetHesapla, fiyatTablosu: VIBENTO_FIYAT }) as unknown as
      { mesajlar: (Mesaj & { girdi_token: unknown })[]; durum: Record<string, unknown> }
    const satirlar: ReturnType<typeof olcum>[] = []
    for (const m of cozum.mesajlar) {
      if (typeof m.girdi_token !== 'number' || gorulen.has(m.uuid)) continue
      gorulen.add(m.uuid)
      satirlar.push(olcum(m))
    }
    const kucultulebilir = (metin.match(/\n/g) ?? []).length > 1
    if (satirlar.length > ALT_AJAN_PARCA_SATIR && kucultulebilir) { pencere = Math.max(1, Math.floor((pnc.son - pnc.bas) / 2)); continue }
    const govde: Record<string, unknown> = {
      dis_seans_id: kaynak.dis_seans_id, dosya: kaynak.dosya, alt_ajan: kaynak.alt_ajan, baslangic_ofset: pnc.bas, bitis_ofset: pnc.son,
      ayristirici_durumu: { son_sira: cozum.durum.son_sira, son_mesaj_id: cozum.durum.son_mesaj_id }, hook_surum: HOOK_SURUM, satirlar,
    }
    if (kaynak.is_akisi) govde.is_akisi = kaynak.is_akisi
    const y = await istek(io, token, '/api/senk/alt-ajan', 'POST', govde, await kalan())
    if (y.ok && y.govde?.ok === true) {
      if (y.govde.seans_bulundu !== true) return 'dur' // ana oturum bu bağlantıda yok: hata değil
      durum = cozum.durum
      imlec = pnc.son
      pencere = Math.min(PENCERE_VARSAYILAN, pencere * 2)
      continue
    }
    if (y.kod === 413 && kucultulebilir) { pencere = Math.max(1, Math.floor((pnc.son - pnc.bas) / 2)); continue }
    if (y.kod === 409) return 'catisma'
    return y.kod === 0 || y.kod === 401 || y.kod >= 500 ? 'dur' : 'hatali'
  }
}

/** Bu oturumun alt ajan dosyalarını eşitler (yalnız büyüyenler, en yeni önce). Hiçbir hata fırlatmaz. */
export async function altAjanEsitle(io: Io, istek: Istek, token: string, transkript: unknown, disSeansId: unknown, butceMs: number) {
  try {
    if (typeof transkript !== 'string' || typeof disSeansId !== 'string') return
    if (!/^[A-Za-z0-9._-]+$/.test(disSeansId) || disSeansId.includes('..')) return
    const a = ayrac(transkript)
    const kok = `${ustKlasor(transkript)}${a}${disSeansId}${a}subagents`
    const baslangic = await io.simdi()
    const kalan = async () => butceMs - ((await io.simdi()) - baslangic)
    const dosyalar = (await dosyalariBul(io, kok, a))
      .filter((d) => d.boyut > 0 && d.dosya.trim().length > 0 && d.dosya.trim().length <= ALT_AJAN_YOL_TAVANI)
      .sort((x, y) => (x.degisti !== y.degisti ? y.degisti - x.degisti : x.dosya < y.dosya ? -1 : 1))
    if (dosyalar.length === 0) return
    const ofsetler: Baslangic[] = []
    for (let i = 0; i < dosyalar.length; i += ALT_AJAN_OFSET_PARCA) {
      const dilim = dosyalar.slice(i, i + ALT_AJAN_OFSET_PARCA).map((d) => d.dosya)
      const y = await istek(io, token, '/api/senk/ofsetler', 'POST', { dosyalar: dilim }, await kalan())
      const liste = y.govde && Array.isArray(y.govde.ofsetler) ? y.govde.ofsetler as { ofset?: unknown; ayristirici_durumu?: unknown }[] : null
      if (!y.ok || y.govde?.ok !== true || !liste || liste.length !== dilim.length) break
      for (const k of liste) {
        const o = Number(k?.ofset)
        ofsetler.push({ ofset: Number.isFinite(o) && o >= 0 ? o : 0, durum: k?.ayristirici_durumu && typeof k.ayristirici_durumu === 'object' ? k.ayristirici_durumu as Record<string, unknown> : {} })
      }
    }
    for (let i = 0; i < ofsetler.length; i += 1) {
      const d = dosyalar[i] as Kaynak
      const bas = ofsetler[i] as Baslangic
      if (d.boyut <= bas.ofset) continue
      if ((await kalan()) <= 500) return
      const kaynak = { ...d, dis_seans_id: disSeansId, alt_ajan: await altAjanKimligi(io, d.dosya, d.boyut, d.dosya_kimligi) }
      let sonuc = await dosyaGonder(io, istek, token, kaynak, bas, kalan)
      if (sonuc === 'catisma') {
        const t = await istek(io, token, '/api/senk/ofsetler', 'POST', { dosyalar: [d.dosya] }, await kalan())
        const k = t.ok && Array.isArray(t.govde?.ofsetler) ? (t.govde?.ofsetler as { ofset?: unknown; ayristirici_durumu?: unknown }[])[0] : null
        if (!k) return
        sonuc = await dosyaGonder(io, istek, token, kaynak,
          { ofset: Number(k.ofset) || 0, durum: k.ayristirici_durumu && typeof k.ayristirici_durumu === 'object' ? k.ayristirici_durumu as Record<string, unknown> : {} }, kalan)
      }
      if (sonuc === 'dur') return
    }
  } catch {
    // fail-open
  }
}
