// =====================================================================
// eklenti/vibento/hooks/register.ts — Vibento'nun Claude Code eklentisi (mod; V1 Adım 3g-3, sözleşme docs/sozlesme-3g-esleme.md §5, Ek 1).
//
// İNCE BAĞLAYICI: iş mantığı sunucuda. Bu modül olayları bağlar: eşleme (esleme.ts), olay iletimi (olay.ts). Kırmızı çizgi: hiçbir hata
// turu bozmaz; her kanca ağ ya da depo hatasında `next(e)`'nin sonucunu aynen döner (fail-open).
// Motor kuralı: `$` değer olarak geçirilmez; her kanca `io`'yu kendi `$`'ından kurar (io.ts). Kurulum satırı her kancada aynıdır.
// =====================================================================

import type { Register } from 'claude-code'
import type { Io } from './io.ts'
// 0.1.27 (`docs/sozlesme-okuma-komutu.md`): `komut` üçüncü argümanla standart girdi ve ortam taşır (yalnız okuma komutu kullanır).
import { komutSecenegi } from './io.ts'
import { SURUM, sunucuAdresi } from './esleme-mantik.mjs'
import { KURULU_KAYDI, kuruluSurumOku, surumGecerli, surumSatiri } from './surum-mantik.mjs'
import { acilisCiktisi, pencereMesajiMetni, istemSinifi, ideBaglamiSoy } from './olay-mantik.mjs'
import { KART_DEPO_ANAHTARI, acikSoruGuncelle, kartDurumu, kartPencereOku, kartPlani, sonKartlarOku } from './kart-mantik.mjs'
import { kartKaydet } from './kart.tsx'
import { atom, read, update } from 'claude-code'
import { kapiAnahtari, kapiHazirla, kapiKarari, onayKarariAyikla, onayKarariMesaji, mesajGecerli } from './kapi-mantik.mjs'
import { aracKimligiGirdisi, izinVerilirMi, vibentoAracAdi, turAnahtari, turKimligiGecerli, kanitAnahtari, kanitSurumuOku } from './kimlik-mantik.mjs'
import { adKaydiKur, adKaydiOku, adListesiAnahtari, adListesiIstenirMi, sozAlanlari } from './ad-mantik.mjs'
import { durumSatiri, vekaletBitisAl, vekaletParcasi } from './vekalet-mantik.mjs'
import { eslemeKur, type Baglanti } from './esleme.ts'
import { olayKur } from './olay.ts'
import { senkKur, istekYap, type Istek } from './senk.ts'
import { altAjanEsitle } from './altajan.ts'
import { uyandirmaKur } from './uyandirma.ts'
import { arkaPlanKur } from './arka-plan.ts'
import type { Surec } from './io.ts'

const kartPencere = atom({ plugin: 'vibento', key: 'kartPencere' } as const, null)
const sonSoru = atom({ plugin: 'vibento', key: 'sonSoru' } as const, '')
const mesajliTur = atom({ plugin: 'vibento', key: 'mesajliTur' } as const, false)
const sonKartlar = atom({ plugin: 'vibento', key: 'sonKartlar' } as const, [])
const acikSoruDurumu = atom({ plugin: 'vibento', key: 'acikSoruDurumu' } as const, { acikSoru: '', soruMesajli: '' })
const cevaplananlar = atom({ plugin: 'vibento', key: 'cevaplananlar' } as const, [])

// Kart anahtarı ve renkler (docs/sozlesme-pencere-kartlari.md): yalnız değişince yazılır; hata turu bozmaz.
const kartDurumuYaz = async (io: Io, govde: unknown, baglantiId: string | undefined) => {
  try {
    const yeni = kartDurumu(await io.depoOku(KART_DEPO_ANAHTARI), govde, baglantiId)
    if (yeni) await io.depoYaz(KART_DEPO_ANAHTARI, yeni)
  } catch { /* kart görünümdür, olay akışını durdurmaz */ }
}

const bagla = (r: { additionalContext?: string[] }, satir: string | null) =>
  satir ? { ...r, additionalContext: [...(r.additionalContext ?? []), satir] } : r

// 0.1.26 (D2b): sunucunun yanıtındaki ad listesi (klasörün öbür pencereleri) oturum başına depoya yazılır; istem metni bununla YERELDE
// eşleştirilir. Yanıtta liste yoksa eski kayıt kalır. Hata turu bozmaz: liste yoksa söz hiçbir pencereye yetmez, onaya düşer.
// YALNIZ eklentinin istediği yanıttan çağrılır (güvenlik taraması 13 Kas B3): sunucu istenmeyen bir yanıta liste koyarak her istemden
// önce yeni bir yoklama listesi yerleştiremesin; liste en çok açılışta ve 10 dakikada bir değişir.
const adListesiniKaydet = async (io: Io, seansId: unknown, govde: Record<string, unknown> | null | undefined) => {
  try {
    const anahtar = adListesiAnahtari(seansId)
    const kayit = anahtar ? adKaydiKur(govde?.ad_listesi, await io.simdi()) : null
    if (anahtar && kayit) await io.depoYaz(anahtar, kayit)
  } catch { /* liste yazılamazsa bir sonraki istekte yeniden istenir */ }
}

// 0.1.26 (D2b; güvenlik taraması 13 Kas B11): sunucu tur kimlikli kanıtı (`k2`) tanıdığını her yanıtta söyler (`kanit_surumu: 2`).
// Eklenti `k2`'yi ancak bu oturumun SON yanıtında bunu gördüyse yazar: sunucu geri alınırsa (eski sunucu `k2`'yi bozuk sayar ve bütün
// kimlik araçlarını reddeder) bir sonraki yanıtla eski biçime (`k1`) döner. Yanıt gelmediyse (ağ hatası) son bilinen değer kalır.
const kanitSurumuKaydet = async (io: Io, seansId: unknown, govde: Record<string, unknown> | null | undefined) => {
  try {
    const anahtar = kanitAnahtari(seansId)
    const surum = kanitSurumuOku(govde)
    if (!anahtar || surum === null) return
    if (surum === 2) await io.depoYaz(anahtar, 2)
    else await io.depoSil(anahtar)
  } catch { /* yazılamazsa eski biçim yazılır: sunucu bugünkü ölçüyle karar verir */ }
}

// 0.1.26 (D2b): turun kimliği. İstemde o istemin olay kimliği yazılır; tur bitince sunucunun BİLMEDİĞİ yeni bir kimlik yazılır: istemsiz
// başlayan bir turun (görev bildirimi, alt ajan dönüşü) araç çağrıları bir önceki turun, yani kullanıcının sözünün kimliğini taşımasın.
const turKimligiYaz = async (io: Io, seansId: unknown, kimlik: string) => {
  try {
    const anahtar = turAnahtari(seansId)
    if (anahtar) await io.depoYaz(anahtar, kimlik)
  } catch { /* yazılamazsa çağrı eski kimlikle ya da kimliksiz gider; sunucu sıkı yönde karar verir */ }
}

// Sürüm satırı (0.1.24): çalışan / kurulu / raftaki sürüm istem kutusunun altında. Görünümdür: konuşmaya girmez, hata turu bozmaz.
// 0.1.26 (D2d madde 4): satırın sonunda Vekâlet göstergesi (`vekalet-mantik.mjs`); her çizimde saate göre yeniden kurulur, süresi dolan
// parça kendiliğinden düşer. Değer yalnız ekrana gider: bağlama, gövdeye ve karara girmez.
const surumGoster = async (io: Io, raf: string | null, vekalet: string | null) => {
  try {
    if (!io.durum) return
    const ev = await io.evKlasoru()
    const a = ev?.includes('\\') ? '\\' : '/'
    const kurulu = ev ? kuruluSurumOku(await io.dosyaOku(`${ev}${a}${KURULU_KAYDI.split('/').join(a)}`).catch(() => null)) : null
    // Saat okunamazsa parça düşer, sürüm satırı yine çizilir.
    let simdi = Number.NaN
    try { simdi = await io.simdi() } catch { /* görünüm */ }
    io.durum(durumSatiri(surumSatiri({ calisan: SURUM, kurulu, raf }), vekaletParcasi(vekalet, simdi)))
  } catch { /* görünüm */ }
}

export const register: Register = (on, options) => {
  kartKaydet(on)
  const sunucu = sunucuAdresi(options.sunucu)
  const esleme = eslemeKur(sunucu)
  const olaylar = olayKur(sunucu)
  const senk = senkKur(sunucu)
  const istek: Istek = (io, t, y, m, g, ms) => istekYap(io, sunucu, t, y, m, g, ms)
  // Boştaki pencere de anahtarın reddedildiğini yoklamada öğrenir: bildirim düşer, sonraki istemde kod gelir.
  const uyandirma = uyandirmaKur(istek, (io, jeton) => esleme.jetonReddedildi(io, jeton))
  // Arka plan pencereler (sözleşme arka-plan-pencere §4): açık pencere sunucudan iş alır, kapalı konuşmayı görünür pencere açmadan sürdürür.
  const arkaPlan = arkaPlanKur(istek, senk.senkYap)
  // Anahtar reddedildi: başka pencere yenilediyse olay yeni anahtarla bir kez yeniden gider, pencere boşa düşmez (tarama Ek 9 O3); değilse bağlantı silinir.
  // Sunucunun bildirdiği son yayın (kanca yanıtı `eklenti_son_surum`); bilinmeden satır yalnız çalışan sürümü yazar.
  let rafSurum: string | null = null
  // 0.1.26 (D2d madde 4): son bilinen Vekâlet bitişi (yalnız gösterge). YALNIZ `vekalet_iste` taşıyan isteğin yanıtından güncellenir:
  // alan varsa değer (null siler), alan yoksa (ağ hatası, eski sunucu) son değer kalır ve süresi dolunca satırdan kendiliğinden düşer.
  let vekaletBitis: string | null = null
  const vekaletKaydet = (govde: unknown) => {
    try {
      const v = vekaletBitisAl(govde)
      if (v.var) vekaletBitis = v.bitis
    } catch { /* görünüm */ }
  }
  const ilet = async (io: Io, k: Baglanti, olay: Record<string, unknown>, ek?: Record<string, unknown>) => {
    const y = await olaylar.ilet(io, k, olay, ek)
    if (y !== 'reddedildi') {
      if (surumGecerli(y.govde?.eklenti_son_surum)) rafSurum = y.govde.eklenti_son_surum
      await kartDurumuYaz(io, y.govde, k.baglanti_id)
      return { y, k }
    }
    const yeni = await esleme.jetonReddedildi(io, k.token)
    if (!yeni) return { y, k }
    const taze = { ...k, token: yeni }
    const y2 = await olaylar.ilet(io, taze, olay, ek)
    if (y2 === 'reddedildi') await esleme.jetonReddedildi(io, yeni)
    else await kartDurumuYaz(io, y2.govde, k.baglanti_id)
    return { y: y2, k: taze }
  }

  // Tur istemsiz de başlar (görev bildirimi, alt ajan dönüşü). Yoklama sürerse uyandırma kuyruğa girer, tur bitince boş uyanır (5 Kas ölçümü). Alt ajanın turu sayılmaz.
  on('turn.start', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined) {
      uyandirma.turBasladi()
      // Tur sürerken düğme canlı kalırsa "1: Evet." tur sonundaki yeni listeye okunur; Stop aynı soruda geri getirir (tarama Ek 21 O2).
      try { await update($, sonSoru, () => '') } catch { /* görünüm */ }
      try { await update($, sonKartlar, () => []) } catch { /* görünüm */ }
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined && e.reason !== 'answer') uyandirma.turBitti()
    // Tur bitti: sıradaki tur kendi istemini getirmezse araç çağrıları bu turun (kullanıcının sözünün) kimliğini taşımaz.
    if (e.agentId === undefined) {
      try {
        const anahtar = turAnahtari(await $.session.id())
        if (anahtar) await $.store.set(anahtar, crypto.randomUUID())
      } catch { /* kimlik yazılamazsa sunucu sıkı yönde karar verir */ }
    }
    return r
  })

  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    const io: Io = {
      depoOku: (k) => $.store.get(k), depoYaz: (k, v) => $.store.set(k, v), depoSil: (k) => $.store.delete(k),
      istek: (u, s) => $.http.fetch(u, s), komut: async (a, ms, s) => $.process.run(a, komutSecenegi(ms, (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? undefined, s)),
      herBirde: (ms, fn) => $.clock.every(ms, fn), sonra: (ms, fn) => $.clock.after(ms, fn), bildir: (t) => $.ui.toast(t),
      simdi: () => $.clock.now(),
      dosyaBoyu: async (y) => { try { const s = await $.fs.stat(y); return typeof s?.size === 'number' ? s.size : null } catch { return null } },
      dizin: async (y) => (await $.fs.list(y)).map((g) => ({ name: g.name, kind: g.kind, size: g.size, mtimeMs: g.mtimeMs })),
      istemGonder: (t) => $.prompt.submit({ text: t }),
      evKlasoru: async () => (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? null,
      sistemKlasoru: async () => (await $.env.get('SystemRoot')) ?? null,
      dosyaYaz: (y, m) => $.fs.write(y, m),
      dosyaOku: async (y) => String(await $.fs.read(y)),
      mcpBagla: async () => { await $.mcp.connect('vibento') },
      surec: (argv, cwd, env) => $.process.spawn({ argv, cwd, env }) as unknown as Surec,
      // Motor kuralı: `$.env.get` sabit ad ister; arka planın okuduğu iki ad burada sayılır.
      ortam: async (ad) => (ad === 'CLAUDE_CODE_EXECPATH' ? $.env.get('CLAUDE_CODE_EXECPATH') : ad === 'VIBENTO_ARKA_PLAN' ? $.env.get('VIBENTO_ARKA_PLAN') : null),
      durum: (t) => $.ui.status(t),
    }
    // Yeni oturum (açılış, sürdürme, temizleme, daraltma): önceki oturumun Vekâlet değeri bu oturum için BİLİNMİYOR, satırdan düşer
    // (D2d güvenlik taraması, bilgi notu: eşlemesi olmayan ya da anahtarı reddedilen pencerede eski "Vekâlet açık" yazısı kalıyordu).
    // Sunucu yanıtlarsa aşağıda yeniden yazılır.
    vekaletBitis = null
    await surumGoster(io, rafSurum, vekaletBitis)
    try {
      const kod = await esleme.acilis(io)
      if (kod) return bagla(r, kod)
      const bagli = await esleme.baglantiOku(io)
      if (!bagli) return r
      // 0.1.26 (D2b): açılışta ad listesi her zaman istenir (klasörün öbür pencereleri; istem metni bununla yerelde eşleştirilir).
      // 0.1.26 (D2d madde 4): Vekâlet göstergesinin bitişi de her açılışta istenir; yanıt yalnız satıra gider.
      const { y, k } = await ilet(io, bagli, e as unknown as Record<string, unknown>, { ad_listesi_iste: true, vekalet_iste: true })
      if (y !== 'reddedildi') vekaletKaydet(y.govde)
      await surumGoster(io, rafSurum, vekaletBitis)
      // Anahtar reddedildi: pencere sessizce kopmasın, kod bu açılışta gelsin (eskiden ikinci bir konuşma gerekiyordu; 2 Kas ölçüldü).
      if (y === 'reddedildi') return bagla(r, await esleme.istem(io))
      await adListesiniKaydet(io, e.session_id, y.govde)
      await kanitSurumuKaydet(io, e.session_id, y.govde)
      const { baglam, oturumAdi } = acilisCiktisi(e as unknown as Record<string, unknown>, y.govde)
      // Kapanış kartının başlığı: bu oturumun kimliği. Sunucu yalnız çoklu çalışmada gönderir; görünümdür, hata açılışı bozmaz.
      try {
        const ben = kartPencereOku(y.govde)
        await update($, kartPencere, () => ben)
      } catch { /* görünüm */ }
      // Açılış da pencereyi boşa düşürür: yeni açılan pencere de uyandırılabilir olmalı (kanca: `--dinle` Stop VE SessionStart'ta).
      const yeniNesil = e.source === 'startup' || e.source === 'resume' || e.source === 'clear'
      if (yeniNesil) uyandirma.basla(io, k.token, e.session_id)
      if (yeniNesil) void arkaPlan.basla(io, k.token, e.session_id)
      // Açılış pencereyi uyandıracaksa mesajlar o turda teslim edilir; burada onaylanmaz (01-bas.mjs baglamiBas, aynı istisna).
      const uy = y.govde?.uyandirma as { acik?: unknown; bekleyen?: unknown } | undefined
      const uyanacak = yeniNesil && uy?.acik === true && Number(uy.bekleyen) > 0
      if (baglam && y.govde && !uyanacak) await olaylar.teslimKaydet(io, e.session_id, y.govde.pencere_mesaji_idler)
      const sonuc = bagla(r, baglam)
      return oturumAdi ? { ...sonuc, sessionTitle: oturumAdi } : sonuc
    } catch {
      return r
    }
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    const r = await next(e)
    const io: Io = {
      depoOku: (k) => $.store.get(k), depoYaz: (k, v) => $.store.set(k, v), depoSil: (k) => $.store.delete(k),
      istek: (u, s) => $.http.fetch(u, s), komut: async (a, ms, s) => $.process.run(a, komutSecenegi(ms, (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? undefined, s)),
      herBirde: (ms, fn) => $.clock.every(ms, fn), sonra: (ms, fn) => $.clock.after(ms, fn), bildir: (t) => $.ui.toast(t),
      simdi: () => $.clock.now(),
      dosyaBoyu: async (y) => { try { const s = await $.fs.stat(y); return typeof s?.size === 'number' ? s.size : null } catch { return null } },
      dizin: async (y) => (await $.fs.list(y)).map((g) => ({ name: g.name, kind: g.kind, size: g.size, mtimeMs: g.mtimeMs })),
      istemGonder: (t) => $.prompt.submit({ text: t }),
      evKlasoru: async () => (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? null,
      sistemKlasoru: async () => (await $.env.get('SystemRoot')) ?? null,
      dosyaYaz: (y, m) => $.fs.write(y, m),
      dosyaOku: async (y) => String(await $.fs.read(y)),
      mcpBagla: async () => { await $.mcp.connect('vibento') },
      durum: (t) => $.ui.status(t),
    }
    // Her istemde: güncelleme bu arada indiyse satır "yeniden yükle" der (tek küçük dosya okuması).
    await surumGoster(io, rafSurum, vekaletBitis)
    // Yeni istem: eski kartın düğmesi kalkar (görünüm; hata turu bozmaz).
    try { await update($, sonSoru, () => '') } catch { /* görünüm */ }
    try { await update($, sonKartlar, () => []) } catch { /* görünüm */ }
    // Kişinin yeni istemi açık soruyu kapatır; uyanan tur kapatmaz.
    if (istemSinifi(e.prompt) === 'insan') {
      try { await update($, acikSoruDurumu, (eski) => ({ ...eski, acikSoru: '' })) } catch { /* görünüm */ }
    }
    try {
      // Pencere artık boşta değil: uyandırma yoklaması durur; insan istemi uyanma frenini sıfırlar.
      uyandirma.istem(e.session_id, istemSinifi(e.prompt) === 'insan')
      const not = await esleme.istem(io)
      const k = await esleme.baglantiOku(io)
      if (!k) return bagla(r, not)
      // Ad kapısı (sözleşme ad-kapisi §4) ve onay kararı (onay-talebi Ek 5 E5.2): metin gitmez, yalnız kapı kimliği / karar.
      const kAnahtar = kapiAnahtari(e.session_id)
      const hazir = kapiHazirla(e.prompt, kAnahtar ? await io.depoOku(kAnahtar) : null, kAnahtar)
      const ek: Record<string, unknown> = {}
      if (hazir.onay) ek.kapi_onay = hazir.onay
      const karar = istemSinifi(e.prompt) === 'insan' ? onayKarariAyikla(ideBaglamiSoy(e.prompt)) : null
      if (karar) ek.onay_karari = karar
      // 0.1.26 (D2b; sözleşme docs/sozlesme-unvanlar.md Ek D2): kullanıcının sözünde ADI GEÇEN pencereler. Eşleştirme burada, yerelde;
      // gövdeye yalnız bölüm kimlikleri ve toplu söz işareti girer, metin girmez (değişmez 4). Yalnız insan isteminde: uyanan tur, arka plan
      // ve görev bildirimi söz değildir. Liste yoksa `anilanlar` boş gider (söz hiçbir pencereye yetmez, onaya düşer).
      const adAnahtar = adListesiAnahtari(e.session_id)
      const adKaydi = adAnahtar ? adKaydiOku(await io.depoOku(adAnahtar)) : null
      if (istemSinifi(e.prompt) === 'insan') Object.assign(ek, sozAlanlari(e.prompt, adKaydi?.liste ?? null))
      if (adListesiIstenirMi(adKaydi, await io.simdi())) ek.ad_listesi_iste = true
      // 0.1.26 (D2d madde 4): Vekâlet göstergesinin bitişi her istemde istenir (tur başında satır tazelenir; konuşmaya girmez).
      ek.vekalet_iste = true
      // Turun kimliği = bu istemin olay kimliği (her istem türünde): araç çağrıları kanıtında taşır (kimlik-mantik.mjs `k2`). İletimden ÖNCE
      // yazılır: istem sunucuya ulaşmasa da bu turun çağrıları bu kimliği taşır ve sunucu "istem ulaşmadı" diye sözü saymaz.
      const turKimligi = crypto.randomUUID()
      ek.olay_kimligi = turKimligi
      await turKimligiYaz(io, e.session_id, turKimligi)
      const { y } = await ilet(io, k, e as unknown as Record<string, unknown>, ek)
      if (y === 'reddedildi') return bagla(r, (await esleme.istem(io)) ?? not)
      // Liste yalnız BU istekte istendiyse kabul edilir (istenmeyen yanıttaki liste yok sayılır).
      if (ek.ad_listesi_iste === true) await adListesiniKaydet(io, e.session_id, y.govde)
      await kanitSurumuKaydet(io, e.session_id, y.govde)
      // Vekâlet bitişi de yalnız BU istekte istendiyse alınır; satır yanıttan sonra yeniden çizilir (görünüm, hata turu bozmaz).
      if (ek.vekalet_iste === true) vekaletKaydet(y.govde)
      await surumGoster(io, rafSurum, vekaletBitis)
      // Öncelik: ad kapısı > onay kararı > pencere mesajı; o turda tek çıktı (değişmez 2, 10, 13). Her hata: durdurma yok.
      const kapi = kapiKarari(hazir, y.govde, e.prompt)
      const adim = kapi.yerel
      if (kAnahtar && adim === 'sil') await io.depoSil(kAnahtar)
      else if (kAnahtar && typeof adim === 'object' && adim !== null) {
        await io.depoYaz(kAnahtar, { ...adim, zaman: new Date(await io.simdi()).toISOString() })
      }
      // Durdurulan istem tur başlatmaz, Stop gelmez: yoklama geri açılır (tarama Ek 21 D6).
      if (mesajGecerli(kapi.mesaj)) { uyandirma.turBitti(); return { ...r, block: kapi.mesaj as string, suppressOriginalPrompt: true } }
      const onayMesaji = onayKarariMesaji(karar !== null, y.govde)
      if (onayMesaji) { uyandirma.turBitti(); return { ...r, block: onayMesaji, suppressOriginalPrompt: true } }
      const mesaj = pencereMesajiMetni(y.govde)
      if (mesaj && y.govde) await olaylar.teslimKaydet(io, e.session_id, y.govde.pencere_mesaji_idler)
      // Uyanan turda mesaj bu istemle gelmese de tur mesajlıdır (tarama Ek 16 O1).
      try { await update($, mesajliTur, () => Boolean(mesaj) || istemSinifi(e.prompt) === 'uyandirma') } catch { /* görünüm */ }
      return bagla(bagla(r, not), mesaj)
    } catch {
      return r
    }
  })

  // Kimlik kanıtı (değişmez 14): ağ yok, depo yazımı yok; yalnız jeton okunur. Vibento dışı araçta hiçbir şey yapılmaz.
  on('classic.PreToolUse', async ($, e, next) => {
    const r = await next(e)
    try {
      if (vibentoAracAdi(e.tool) === null) return r
      const { tool: _arac, tool_use_id: _kimlik, agentId: _ajan, ...girdi } = e as unknown as Record<string, unknown>
      const k = await $.store.get('vibento.baglanti') as { token?: unknown } | undefined
      const jeton = typeof k?.token === 'string' ? k.token : null
      // 0.1.26 (D2b): turun kimliği depodan OKUNUR (yazım yok; değişmez 14) ve kanıta girer.
      const oturum = await $.session.id()
      const tAnahtar = turAnahtari(oturum)
      const tur = tAnahtar ? await $.store.get(tAnahtar) : null
      // Tur kimlikli kanıt yalnız sunucu onu tanıdığını bu oturumun son yanıtında söylediyse yazılır; değilse eski biçim.
      const kAnahtar = kanitAnahtari(oturum)
      const sunucuTanir = kAnahtar ? (await $.store.get(kAnahtar)) === 2 : false
      const yeni = await aracKimligiGirdisi(e.tool, oturum, girdi, jeton, sunucuTanir && turKimligiGecerli(tur) ? tur : null)
      const sonuc = yeni ? { ...r, updatedInput: yeni } : r
      // Altta karar yoksa eklentinin kendi araçları izin sormaz (kimlik-mantik.mjs izinVerilirMi); değişmez 14'ün eklentideki tek eki.
      if (izinVerilirMi(e.tool) && !r.allow && !r.ask && !r.deny) {
        return { allow: true as const, ...(yeni ? { updatedInput: yeni } : {}), ...(r.additionalContext ? { additionalContext: r.additionalContext } : {}) }
      }
      return sonuc
    } catch {
      return r
    }
  })

  on('classic.Stop', async ($, e, next) => {
    const r = await next(e)
    const io: Io = {
      depoOku: (k) => $.store.get(k), depoYaz: (k, v) => $.store.set(k, v), depoSil: (k) => $.store.delete(k),
      istek: (u, s) => $.http.fetch(u, s), komut: async (a, ms, s) => $.process.run(a, komutSecenegi(ms, (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? undefined, s)),
      herBirde: (ms, fn) => $.clock.every(ms, fn), sonra: (ms, fn) => $.clock.after(ms, fn), bildir: (t) => $.ui.toast(t),
      simdi: () => $.clock.now(),
      dosyaBoyu: async (y) => { try { const s = await $.fs.stat(y); return typeof s?.size === 'number' ? s.size : null } catch { return null } },
      dizin: async (y) => (await $.fs.list(y)).map((g) => ({ name: g.name, kind: g.kind, size: g.size, mtimeMs: g.mtimeMs })),
      istemGonder: (t) => $.prompt.submit({ text: t }),
      evKlasoru: async () => (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? null,
      sistemKlasoru: async () => (await $.env.get('SystemRoot')) ?? null,
      dosyaYaz: (y, m) => $.fs.write(y, m),
      dosyaOku: async (y) => String(await $.fs.read(y)),
      mcpBagla: async () => { await $.mcp.connect('vibento') },
      surec: (argv, cwd, env) => $.process.spawn({ argv, cwd, env }) as unknown as Surec,
      ortam: async (ad) => (ad === 'CLAUDE_CODE_EXECPATH' ? $.env.get('CLAUDE_CODE_EXECPATH') : ad === 'VIBENTO_ARKA_PLAN' ? $.env.get('VIBENTO_ARKA_PLAN') : null),
      durum: (t) => $.ui.status(t),
    }
    try {
      const bagli = await esleme.baglantiOku(io)
      if (!bagli) return r
      const { y, k } = await ilet(io, bagli, e as unknown as Record<string, unknown>)
      if (y === 'reddedildi') return r
      // Kanca yanıtı raftaki sürümü taşır: satır tur bitince de tazelenir (yeniden yüklenen pencere ilk turunda "güncel"i görür).
      // Vekâlet parçası burada yalnız son bilinen değerle yeniden çizilir (Stop yanıtından değer alınmaz; süresi dolduysa düşer).
      await surumGoster(io, rafSurum, vekaletBitis)
      // Sohbet kaydı arka planda (tur beklemez); aynı dosyada ikinci eşitleme başlamaz (senk.ts).
      // Pencere boşa düştü: uyandırma yoklaması başlar (Realtime yerine; mod ortamında WebSocket yok).
      uyandirma.basla(io, k.token, e.session_id)
      // 0.1.25 (10 Kas ölçümü): `/reload-plugins` modülü baştan kurar ama SessionStart üretmez; arka plan yoklaması yalnız açılışta başladığı için
      // yeniden yüklenen pencere iş sormuyor, sürümünü de bildirmiyordu. `basla` tek seferliktir (zaten çalışıyorsa bir şey yapmaz), arka plan
      // oturumunun kendisinde başlamaz.
      void arkaPlan.basla(io, k.token, e.session_id)
      void senk.senkYap(io, k.token, e.transcript_path, e.session_id, e.cwd, 20_000)
        .then(() => altAjanEsitle(io, istek, k.token, e.transcript_path, e.session_id, 15_000))
      // Düğme yalnız son yanıtın sorusunda (kart-mantik dugmeIzni).
      try {
        const plan = kartPlani(e.last_assistant_message)
        const soru = plan?.kapanis?.soru ?? ''
        const tam = plan?.kapanis?.tam ?? ''
        await update($, sonSoru, () => tam)
        await update($, sonKartlar, () => sonKartlarOku(plan))
        const mesajli = (await read($, mesajliTur)) === true
        const kendiSorusu = plan?.kapanis?.kaynak ? '' : tam
        await update($, acikSoruDurumu, (eski) => acikSoruGuncelle(eski, kendiSorusu, mesajli))
        // Metin anahtarı yalnız art arda yinelemeyi kapatır: soru değişince aynı metin yeniden düğme alır (tarama Ek 16 O2).
        await update($, cevaplananlar, (eski) => eski.filter((k) => /^[0-9a-f]{6}$/.test(k) || k === soru))
      } catch { /* görünüm */ }
      // Değişmez 11: Stop'ta block yok; Claude zaten bir Stop kancası yüzünden devam ediyorsa mesaj basılmaz.
      if (e.stop_hook_active === true) return r
      const mesaj = pencereMesajiMetni(y.govde)
      if (mesaj && y.govde) await olaylar.teslimKaydet(io, e.session_id, y.govde.pencere_mesaji_idler)
      if (mesaj) {
        // Mesaj bu Stop'ta teslim edildi, tur sürer (bağlam modele gidiyor, 5 Kas bu pencerede görüldü): yoklama sonraki Stop'ta başlar.
        uyandirma.durdur(e.session_id)
        try {
          await update($, mesajliTur, () => true)
          // Model mesajı işlerken düğme kalkar: yalın "Evet." yeni soruya okunmasın. Aynı soru yinelenince sonraki Stop geri getirir (tarama Ek 16 N1).
          await update($, sonSoru, () => '')
        } catch { /* görünüm */ }
      }
      return bagla(r, mesaj)
    } catch {
      return r
    }
  })

  on('classic.PreCompact', async ($, e, next) => {
    const r = await next(e)
    const io: Io = {
      depoOku: (k) => $.store.get(k), depoYaz: (k, v) => $.store.set(k, v), depoSil: (k) => $.store.delete(k),
      istek: (u, s) => $.http.fetch(u, s), komut: async (a, ms, s) => $.process.run(a, komutSecenegi(ms, (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? undefined, s)),
      herBirde: (ms, fn) => $.clock.every(ms, fn), sonra: (ms, fn) => $.clock.after(ms, fn), bildir: (t) => $.ui.toast(t),
      simdi: () => $.clock.now(),
      dosyaBoyu: async (y) => { try { const s = await $.fs.stat(y); return typeof s?.size === 'number' ? s.size : null } catch { return null } },
      dizin: async (y) => (await $.fs.list(y)).map((g) => ({ name: g.name, kind: g.kind, size: g.size, mtimeMs: g.mtimeMs })),
      istemGonder: (t) => $.prompt.submit({ text: t }),
      evKlasoru: async () => (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? null,
      sistemKlasoru: async () => (await $.env.get('SystemRoot')) ?? null,
      dosyaYaz: (y, m) => $.fs.write(y, m),
      dosyaOku: async (y) => String(await $.fs.read(y)),
      mcpBagla: async () => { await $.mcp.connect('vibento') },
    }
    try {
      const k = await esleme.baglantiOku(io)
      if (k && (await olaylar.ilet(io, k, e as unknown as Record<string, unknown>)) === 'reddedildi') await esleme.jetonReddedildi(io, k.token)
      else if (k) void senk.senkYap(io, k.token, e.transcript_path, e.session_id, e.cwd, 20_000)
    } catch {
      // fail-open
    }
    return r
  })

  on('classic.SessionEnd', async ($, e, next) => {
    const r = await next(e)
    esleme.durdur()
    uyandirma.durdur(e.session_id)
    arkaPlan.durdur()
    const io: Io = {
      depoOku: (k) => $.store.get(k), depoYaz: (k, v) => $.store.set(k, v), depoSil: (k) => $.store.delete(k),
      istek: (u, s) => $.http.fetch(u, s), komut: async (a, ms, s) => $.process.run(a, komutSecenegi(ms, (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? undefined, s)),
      herBirde: (ms, fn) => $.clock.every(ms, fn), sonra: (ms, fn) => $.clock.after(ms, fn), bildir: (t) => $.ui.toast(t),
      simdi: () => $.clock.now(),
      dosyaBoyu: async (y) => { try { const s = await $.fs.stat(y); return typeof s?.size === 'number' ? s.size : null } catch { return null } },
      dizin: async (y) => (await $.fs.list(y)).map((g) => ({ name: g.name, kind: g.kind, size: g.size, mtimeMs: g.mtimeMs })),
      istemGonder: (t) => $.prompt.submit({ text: t }),
      evKlasoru: async () => (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? null,
      sistemKlasoru: async () => (await $.env.get('SystemRoot')) ?? null,
      dosyaYaz: (y, m) => $.fs.write(y, m),
      dosyaOku: async (y) => String(await $.fs.read(y)),
      mcpBagla: async () => { await $.mcp.connect('vibento') },
    }
    try {
      // Değişmez 10: ad kapısının yerel adımı oturum kapanınca silinir.
      const kAnahtar = kapiAnahtari(e.session_id)
      if (kAnahtar) await io.depoSil(kAnahtar)
      // 0.1.26 (güvenlik taraması 13 Kas B8): oturumun ad listesi, tur kimliği ve kanıt sürümü kaydı da silinir (depo büyümesin; devam
      // eden oturum açılışta listeyi ve sürümü yeniden alır, tur kimliğini ilk istem yazar).
      for (const anahtar of [adListesiAnahtari(e.session_id), turAnahtari(e.session_id), kanitAnahtari(e.session_id)]) {
        if (anahtar) await io.depoSil(anahtar).catch(() => {})
      }
      const k = await esleme.baglantiOku(io)
      // Kapanışta kısa bütçe (bugünkü kanca 1 sn): kalan, bir sonraki açılışın Stop'unda sunucunun ofsetinden sürer. Anahtar reddedildiyse iş de
      // sonraki açılışa kalır: kapanan pencereyi bekletmeye değmez, kopma duyurusunu görecek kimse yok.
      if (k && (await olaylar.ilet(io, k, e as unknown as Record<string, unknown>)) !== 'reddedildi') await senk.senkYap(io, k.token, e.transcript_path, e.session_id, e.cwd, 1_500)
    } catch {
      // fail-open
    }
    return r
  })
}
