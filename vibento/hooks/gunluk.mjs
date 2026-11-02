// ÜRETİLDİ: scripts/eklenti-esitle.mjs (kaynak src/server/gunluk/{ayristirici,suzgec,fiyat}.mjs, hook-betigi gunlukKaynagi).
// Elle düzenleme. Kancanın gömülü günlük çekirdeğiyle birebir aynı metin.
/* eslint-disable */
const Buffer = { byteLength: (s) => new TextEncoder().encode(String(s)).length };

// --- Vibento gunluk cekirdegi (src/server/gunluk/**'dan gomuldu) ---

// Kaynak tek yerdedir: ayristirici.mjs · suzgec.mjs · fiyat.mjs.

// Buraya KOPYALANMAZ, seri hale getirilir; sunucunun ikinci suzgeci

// ile kancanin birinci suzgeci ayni koddur.

const VIBENTO_FIYAT = {"claude-fable-5-1":[{"baslangic":null,"girdi":10,"cache_yazma_5d":12.5,"cache_yazma_1s":20,"cache_okuma":0.25,"cikti":50}],"claude-mythos-5-1":[{"baslangic":null,"girdi":10,"cache_yazma_5d":12.5,"cache_yazma_1s":20,"cache_okuma":0.25,"cikti":50}],"claude-fable-5":[{"baslangic":null,"girdi":10,"cache_yazma_5d":12.5,"cache_yazma_1s":20,"cache_okuma":1,"cikti":50}],"claude-mythos-5":[{"baslangic":null,"girdi":10,"cache_yazma_5d":12.5,"cache_yazma_1s":20,"cache_okuma":1,"cikti":50}],"claude-opus-5-5":[{"baslangic":null,"girdi":4,"cache_yazma_5d":5,"cache_yazma_1s":8,"cache_okuma":0.2,"cikti":20}],"claude-opus-5":[{"baslangic":null,"girdi":5,"cache_yazma_5d":6.25,"cache_yazma_1s":10,"cache_okuma":0.5,"cikti":25}],"claude-opus-4-8":[{"baslangic":null,"girdi":5,"cache_yazma_5d":6.25,"cache_yazma_1s":10,"cache_okuma":0.5,"cikti":25}],"claude-opus-4-7":[{"baslangic":null,"girdi":5,"cache_yazma_5d":6.25,"cache_yazma_1s":10,"cache_okuma":0.5,"cikti":25}],"claude-opus-4-6":[{"baslangic":null,"girdi":5,"cache_yazma_5d":6.25,"cache_yazma_1s":10,"cache_okuma":0.5,"cikti":25}],"claude-opus-4-5":[{"baslangic":null,"girdi":5,"cache_yazma_5d":6.25,"cache_yazma_1s":10,"cache_okuma":0.5,"cikti":25}],"claude-opus-4-1":[{"baslangic":null,"girdi":15,"cache_yazma_5d":18.75,"cache_yazma_1s":30,"cache_okuma":1.5,"cikti":75}],"claude-opus-4":[{"baslangic":null,"girdi":15,"cache_yazma_5d":18.75,"cache_yazma_1s":30,"cache_okuma":1.5,"cikti":75}],"claude-sonnet-5-5":[{"baslangic":null,"girdi":2,"cache_yazma_5d":2.5,"cache_yazma_1s":4,"cache_okuma":0.1,"cikti":10}],"claude-sonnet-5":[{"baslangic":null,"girdi":2,"cache_yazma_5d":2.5,"cache_yazma_1s":4,"cache_okuma":0.2,"cikti":10}],"claude-sonnet-4-6":[{"baslangic":null,"girdi":3,"cache_yazma_5d":3.75,"cache_yazma_1s":6,"cache_okuma":0.3,"cikti":15}],"claude-sonnet-4-5":[{"baslangic":null,"girdi":3,"cache_yazma_5d":3.75,"cache_yazma_1s":6,"cache_okuma":0.3,"cikti":15}],"claude-sonnet-4":[{"baslangic":null,"girdi":3,"cache_yazma_5d":3.75,"cache_yazma_1s":6,"cache_okuma":0.3,"cikti":15}],"claude-haiku-5-5":[{"baslangic":null,"girdi":0.1,"cache_yazma_5d":0.125,"cache_yazma_1s":0.2,"cache_okuma":0.01,"cikti":0.5,"esik":{"istem_token":100000,"girdi":0.5,"cache_yazma_5d":0.625,"cache_yazma_1s":1,"cache_okuma":0.05,"cikti":2.5}}],"claude-haiku-4-5":[{"baslangic":null,"girdi":1,"cache_yazma_5d":1.25,"cache_yazma_1s":2,"cache_okuma":0.1,"cikti":5}],"claude-haiku-3-5":[{"baslangic":null,"girdi":0.8,"cache_yazma_5d":1,"cache_yazma_1s":1.6,"cache_okuma":0.08,"cikti":4}]};

const maliyetHesapla = function (model, usage, tablo, zaman) {
  if (!usage || typeof usage !== "object") return null;

  const sayi = function (deger) {
    return typeof deger === "number" && Number.isFinite(deger) && deger > 0 ? deger : 0;
  };
  const girdi = sayi(usage.input_tokens);
  const cikti = sayi(usage.output_tokens);
  const okuma = sayi(usage.cache_read_input_tokens);
  const yazmaToplam = sayi(usage.cache_creation_input_tokens);

  // Sıfır tokenın maliyeti sıfırdır; "modeli bilinmiyor" değil.
  if (girdi + cikti + okuma + yazmaToplam === 0) return 0;
  if (typeof model !== "string" || model.length === 0) return null;
  if (!tablo || typeof tablo !== "object") return null;

  // Kural 7: standart dışı hız ya da bölge fiyatsız (tabloda çarpanı yok).
  // Kırpılarak karşılaştırılır: sunucu ve doldurma ucu değeri kırpıp yazar,
  // kanca ham usage'la hesaplar; ikisi aynı sonucu vermeli.
  const hiz = typeof usage.speed === "string" ? usage.speed.trim() : "";
  if (hiz.length > 0 && hiz !== "standard") return null;
  const bolge = typeof usage.inference_geo === "string" ? usage.inference_geo.trim() : "";
  if (bolge.length > 0 && bolge !== "global" && bolge !== "not_available") return null;

  const sahip = function (anahtar) {
    return Object.prototype.hasOwnProperty.call(tablo, anahtar) ? tablo[anahtar] : null;
  };
  let donemler = sahip(model);
  if (!donemler) {
    const tarihsiz = model.replace(/-\d{8}$/, "");
    if (tarihsiz !== model) donemler = sahip(tarihsiz);
  }
  if (!Array.isArray(donemler) || donemler.length === 0) return null;

  let gun = null;
  if (typeof zaman === "string" && zaman.length > 0) {
    const an = Date.parse(zaman);
    if (Number.isFinite(an)) gun = new Date(an).toISOString().slice(0, 10);
  }

  let secilen = null;
  let secilenBas = null;
  for (const donem of donemler) {
    if (!donem || typeof donem !== "object") continue;
    const bas = typeof donem.baslangic === "string" ? donem.baslangic : null;
    if (gun !== null && bas !== null && bas > gun) continue;
    if (secilen === null || (bas !== null && (secilenBas === null || bas > secilenBas))) {
      secilen = donem;
      secilenBas = bas;
    }
  }
  if (secilen === null) return null;

  let fiyat = secilen;
  const esik = secilen.esik;
  if (
    esik &&
    typeof esik === "object" &&
    typeof esik.istem_token === "number" &&
    girdi + okuma + yazmaToplam > esik.istem_token
  ) {
    fiyat = esik;
  }

  // `cache_creation` alt nesnesi varsa 1 saatlik yazma AYRI fiyatlanır.
  // 10 Eki ölçümü: bu makinedeki transkriptlerde yazımın %94-100'ü 1
  // saatlik; kırılımı atan sunucu tutarı DÜŞÜK yazıyordu. Toplam esastır:
  // 1 saatlik pay toplamı aşamaz, kalanı 5 dakikalıktır (veritabanındaki
  // `mesaj_maliyeti` ile birebir; tutarsız kırılımda da aynı sonuç).
  const kirilim = usage.cache_creation;
  let yazma5d = yazmaToplam;
  let yazma1s = 0;
  if (kirilim && typeof kirilim === "object") {
    const b5 = sayi(kirilim.ephemeral_5m_input_tokens);
    const b1 = sayi(kirilim.ephemeral_1h_input_tokens);
    if (b5 + b1 > 0) {
      yazma1s = Math.min(b1, yazmaToplam);
      yazma5d = yazmaToplam - yazma1s;
    }
  }

  const toplam =
    (girdi * fiyat.girdi +
      cikti * fiyat.cikti +
      okuma * fiyat.cache_okuma +
      yazma5d * fiyat.cache_yazma_5d +
      yazma1s * fiyat.cache_yazma_1s) /
    1000000;

  return Math.round(toplam * 1000000) / 1000000;
};

const gizliSuz = function (metin) {
  if (typeof metin !== "string" || metin.length === 0) {
    return { metin: typeof metin === "string" ? metin : "", sayi: 0, turler: {} };
  }

  // --- DOĞRUSAL SÜRE (21 Eki 2026, güvenlik paketi D3) -----------------
  // Süzgeç kancada senkron koşar; tur bütçesi onu kesemez. Bu yüzden her
  // desen girdi boyunda DOĞRUSAL olmalı. Ölçülen karesel dört desen
  // (200 000 karakterde): JWT ("eyJ" tekrarı, 100 K'da 6 sn), AD=DEĞER
  // (tek kelimede "KEY" tekrarı, 9,5 sn), bağlantı dizesi ("postgres://a:"
  // tekrarı, 2,5 sn), kapanmayan PEM bloğu (0,56 sn). Ortak sebep: başarısız
  // bir başlangıç metnin sonuna kadar tarıyor, sonraki başlangıç AYNI
  // kuyruğu yeniden tarıyordu. Çare her desende aynı fikir: anlam aynen
  // korunur, yalnız sonucu belli olan yeniden tarama atlanır. Parçalara
  // bölme ve uzunluk tavanı SEÇİLMEDİ: uzun bir sır (birkaç KB'lık JWT ya
  // da PEM) parça sınırına ya da tavana takılıp açıkta kalabilirdi.

  // PEM: soldan ilk BEGIN, ondan sonraki İLK END'e kadar tek parça (eski
  // `[\s\S]*?` deseninin anlamı). Bir BEGIN'den sonra hiç END yoksa daha
  // sağdaki BEGIN'lerden sonra da yoktur: arama orada biter. Eski desen
  // kapanmayan her BEGIN için metnin sonuna kadar tarıyordu.
  const pemSuz = function (girdi) {
    if (girdi.indexOf("-----BEGIN ") === -1) return { metin: girdi, adet: 0 };
    const basRe = /-----BEGIN [A-Z ]*PRIVATE KEY-----/g;
    const sonRe = /-----END [A-Z ]*PRIVATE KEY-----/g;
    let cikti = "";
    let yazilan = 0;
    let adet = 0;
    for (;;) {
      basRe.lastIndex = yazilan;
      const bas = basRe.exec(girdi);
      if (bas === null) break;
      sonRe.lastIndex = bas.index + bas[0].length;
      const son = sonRe.exec(girdi);
      if (son === null) break;
      cikti += girdi.slice(yazilan, bas.index) + "[GİZLİ:ozel_anahtar]";
      yazilan = son.index + son[0].length;
      adet += 1;
    }
    if (adet === 0) return { metin: girdi, adet: 0 };
    return { metin: cikti + girdi.slice(yazilan), adet: adet };
  };

  // JWT: `eyJ[s]{10,}\.[s]{10,}\.[s]{10,}` (s = [A-Za-z0-9_-]). Eşleşme
  // yalnız [A-Za-z0-9_.-] koşusunun içinde olabilir; koşu noktalardan
  // dilimlere bölünür. "." sınıfta olmadığı için birinci niceleyici
  // dilimin SONUNA kadar gider: eşleşme i. dilimdeki EN SOLDAKİ "eyJ"den
  // (ardında 10+ karakter varsa) başlar ve (i+2). dilimin sonunda biter;
  // (i+1) ve (i+2). dilim 10+ karakter olmalı. Soldaki "eyJ" tutmazsa aynı
  // dilimdeki sonrakiler de tutmaz (dilim sonu ortak) — eski desen her
  // birini dilim sonuna kadar yeniden tarıyordu.
  const jwtSuz = function (girdi) {
    if (girdi.indexOf("eyJ") === -1) return { metin: girdi, adet: 0 };
    let adet = 0;
    const metin = girdi.replace(/[A-Za-z0-9_.-]+/g, function (parca) {
      // En kısa JWT: 3 + 10 + 1 + 10 + 1 + 10 = 35 karakter.
      if (parca.length < 35 || parca.indexOf("eyJ") === -1) return parca;
      const dilimler = parca.split(".");
      let cikti = "";
      let yazilan = 0;
      let bas = 0;
      let i = 0;
      while (i < dilimler.length) {
        const dilim = dilimler[i];
        if (i + 2 < dilimler.length && dilimler[i + 1].length >= 10 && dilimler[i + 2].length >= 10) {
          const konum = dilim.indexOf("eyJ");
          if (konum !== -1 && dilim.length - konum - 3 >= 10) {
            const son = bas + dilim.length + 1 + dilimler[i + 1].length + 1 + dilimler[i + 2].length;
            cikti += parca.slice(yazilan, bas + konum) + "[GİZLİ:jwt]";
            yazilan = son;
            adet += 1;
            bas = son + 1;
            i += 3;
            continue;
          }
        }
        bas += dilim.length + 1;
        i += 1;
      }
      if (yazilan === 0) return parca;
      return cikti + parca.slice(yazilan);
    });
    return { metin: metin, adet: adet };
  };

  // Sıra ÖNEMLİ: önce biçim imzası olan dar desenler, en sonda geniş
  // "AD=DEĞER" deseni. Ters sırada, `API_KEY=sk-...` satırı geniş desene
  // düşer ve türü kaybolurdu.
  const DESENLER = [
    // Çok satırlı PEM bloğu — en önce, içindeki base64 başka desenlere
    // takılmadan tek parça silinsin.
    { tur: "ozel_anahtar", isle: pemSuz },
    { tur: "jwt", isle: jwtSuz },
    { tur: "sk_anahtari", re: /sk-[A-Za-z0-9_-]{16,}/g },
    { tur: "vibento_token", re: /vib_[A-Za-z0-9_-]{30,}/g },
    { tur: "github", re: /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}/g },
    { tur: "aws", re: /\bAKIA[0-9A-Z]{16}\b/g },
    { tur: "slack", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
    { tur: "supabase_pat", re: /\bsbp_[a-f0-9]{40}\b/g },
    { tur: "sendgrid", re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g },
    { tur: "brevo", re: /\bxkeysib-[a-f0-9]{64}-[A-Za-z0-9]{16}\b/g },
    // Kanca 24: PreToolUse'un `kaynak_oturum`'a eklediği kimlik kanıtı
    // (`<session_id>.k1.<32 hex>`, güvenlik paketi E2.3). Oturum başına sabit
    // ve araç girdisi olarak yerel transkripte düşebilir; oturum kimliği kalır,
    // kanıt gider. Sabit uzunluklu desen: doğrusal.
    { tur: "kimlik_kaniti", re: /\.k1\.[0-9a-f]{32}(?![0-9a-f])/g },
  ];

  const sayaclar = {};
  let sonuc = metin;

  const say = function (tur, adet) {
    if (adet <= 0) return;
    sayaclar[tur] = (sayaclar[tur] || 0) + adet;
  };

  for (const desen of DESENLER) {
    if (desen.isle) {
      const islenen = desen.isle(sonuc);
      sonuc = islenen.metin;
      say(desen.tur, islenen.adet);
      continue;
    }
    let adet = 0;
    sonuc = sonuc.replace(desen.re, function () {
      adet += 1;
      return "[GİZLİ:" + desen.tur + "]";
    });
    say(desen.tur, adet);
  }

  // `Bearer <token>`: sözcük kalır, değer gider. "Bearer" tek başına ya
  // da 16 karakterden kısa bir değerle dokunulmaz.
  let bearerAdet = 0;
  sonuc = sonuc.replace(/Bearer\s+(?!\[GİZLİ:)[A-Za-z0-9._~+/=-]{16,}/g, function () {
    bearerAdet += 1;
    return "Bearer [GİZLİ:bearer]";
  });
  say("bearer", bearerAdet);

  // Bağlantı dizesi: kullanıcı adı kalır (teşhis için gerekli), PAROLA gider.
  // Doğrusal süre: desenin hiçbir parçası boşluk içermez, yani eşleşme tek
  // bir boşluksuz parçanın içindedir ve "@" ile biter. Desen her parçada
  // yalnız SON "@"a kadarki öneke uygulanır; önekte her parola koşusu bir
  // "@" ile biter, başarısız başlangıç kuyruğu yeniden taramaz. (Eski hâl
  // "postgres://a:" tekrarında her başlangıçta metnin sonuna gidiyordu.)
  let dsnAdet = 0;
  if (sonuc.indexOf("://") !== -1) {
    const dsnRe = /\b(postgres(?:ql)?|mysql|redis|mongodb(?:\+srv)?|amqp):\/\/([^:\s/@]+):(?!\[GİZLİ:)([^@\s]+)@/g;
    const dsnDegistir = function (_tam, sema, kullanici) {
      dsnAdet += 1;
      return sema + "://" + kullanici + ":[GİZLİ:baglanti_parolasi]@";
    };
    sonuc = sonuc.replace(/\S+/g, function (parca) {
      const sonAt = parca.lastIndexOf("@");
      if (sonAt === -1 || parca.indexOf("://") === -1) return parca;
      return parca.slice(0, sonAt + 1).replace(dsnRe, dsnDegistir) + parca.slice(sonAt + 1);
    });
  }
  say("baglanti_parolasi", dsnAdet);

  // --- KART VERİSİ (2 Eki 2026) ---------------------------------------
  // Sıra: dar imzalı desenlerden SONRA (bir anahtarın içindeki rakam
  // koşusu kart sanılmasın), AD=DEĞER'den ÖNCE (türü kaybolmasın).
  //
  // Kart numarası üç kapıdan geçer; üçü de sayıya değil BİÇİME dayanır:
  //   ① koşu: rakam + ayraç dizisinin en uzun hâli. İçinden aday yalnız
  //      GRUP SINIRINDA çıkar: tek parça 13-19 hane ya da kart dizgisi
  //      biçimi (4-4-4-4, 4-6-5 …). "ref no + hesap no" gibi yan yana
  //      duran iki sayı bu yüzden birleşip kart olmaz; numaranın peşindeki
  //      "09/28 123" de numarayı saklayamaz.
  //   ② marka: ilk haneler ile uzunluk birbirini tutar (4 → 13/16/19,
  //      51-55 → 16, 2221-2720 → 16, 34/37 → 15, 9792 → 16 …). 14 haneli
  //      zaman damgası ve "1" ile başlayan posta/olay kimliği burada düşer.
  //   ③ Luhn.
  // İki istisna grup sınırını gevşetir (2 Eki saldırı testi):
  //   · ETİKETLİ BİTİŞİK ALAN: "KARTNO:<numara><tarih>" gibi numaranın
  //     arkasına rakamlı bir alan yapışmışsa, etiketin hemen ardındaki
  //     uzun grubun BAŞINDAN 16/15 hane denenir. Etiketsiz denenmez:
  //     uzun rakam dizilerinin ~%8'i rastgele tutardı.
  //   · HARF ARALIKLI: "4 1 1 1 …" (her grup tek hane) birleştirilir.
  // Korumalar: IBAN, UUID'nin içi, uzun onaltılık dizinin (hash) içi,
  // ondalık kesir ve "+" ile başlayan telefon numarası aday olamaz.
  // Numaranın TAMAMI gider, son dört hane de: bkz. DECISIONS 2 Eki 2026.
  const luhnGecer = function (rakamlar) {
    let toplam = 0;
    let cift = false;
    for (let i = rakamlar.length - 1; i >= 0; i -= 1) {
      let r = rakamlar.charCodeAt(i) - 48;
      if (cift) {
        r *= 2;
        if (r > 9) r -= 9;
      }
      toplam += r;
      cift = !cift;
    }
    return toplam % 10 === 0;
  };

  const kartMi = function (rakamlar) {
    const n = rakamlar.length;
    if (n < 13 || n > 19) return false;
    const ilk = rakamlar.charCodeAt(0) - 48;
    const iki = Number(rakamlar.slice(0, 2));
    const dort = Number(rakamlar.slice(0, 4));
    let uygun = false;
    // 17 ve 18 hane hiçbir markada basılmıyor; kuru koşuda (2 Eki) tek
    // yanlış pozitif 18 haneli bir arama kimliğiydi.
    const onAltiYaDaOnDokuz = n === 16 || n === 19;
    if (ilk === 4) uygun = n === 13 || onAltiYaDaOnDokuz;
    else if (ilk === 5) uygun = iki >= 51 && iki <= 55 ? n === 16 : onAltiYaDaOnDokuz;
    else if (ilk === 2) uygun = n === 16 && dort >= 2221 && dort <= 2720;
    else if (ilk === 3) {
      if (iki === 34 || iki === 37) uygun = n === 15;
      else if (iki === 35) uygun = onAltiYaDaOnDokuz;
      else if (iki === 30 || iki === 36 || iki === 38 || iki === 39) uygun = n === 14 || n === 16;
    } else if (ilk === 6) uygun = onAltiYaDaOnDokuz;
    else if (ilk === 9) uygun = n === 16 && dort === 9792;
    return uygun && luhnGecer(rakamlar);
  };

  const KART_BICIMLERI = [
    [4, 4, 4, 4, 3],
    [4, 4, 4, 4],
    [4, 6, 5],
    [4, 4, 4, 3],
    [4, 6, 4],
    [4, 4, 4, 2],
    [4, 4, 4, 1],
  ];

  // IBAN'ı tümüyle rakam olan ülkeler: ülke kodundan sonraki rakam sayısı
  // (denetim haneleri dahil). Listede olmayan iki harf koruma AÇMAZ:
  // "AB12 <kart>" yazımı numarayı saklayamaz.
  const IBAN_RAKAM = {
    AT: 18, BE: 14, CH: 19, CZ: 22, DE: 20, DK: 16, EE: 18, ES: 22, FI: 16, FR: 25, GR: 25, HR: 19,
    HU: 26, IT: 25, LT: 18, LU: 18, NO: 13, PL: 26, PT: 23, RS: 20, SE: 22, SI: 17, SK: 22, TR: 24,
  };

  const rakamMi = function (kod) {
    return kod >= 48 && kod <= 57;
  };
  const buyukHarfMi = function (kod) {
    return kod >= 65 && kod <= 90;
  };
  const harfMi = function (kod) {
    return (kod >= 65 && kod <= 90) || (kod >= 97 && kod <= 122);
  };
  const kucukOnaltilikMi = function (kod) {
    return (kod >= 48 && kod <= 57) || (kod >= 97 && kod <= 102);
  };

  // UUID aralıkları yalnız gerekince (kapıları geçen bir aday çıkınca) ve
  // metin başına bir kez hesaplanır. Adaylar soldan sağa geldiği için
  // imleç yalnız ileri gider: toplam maliyet doğrusaldır.
  let uuidAraliklari = null;
  let uuidImlec = 0;
  const uuidIcinde = function (bas, son, tum) {
    if (uuidAraliklari === null) {
      uuidAraliklari = [];
      const uuidRe =
        /(?<![0-9a-fA-F])[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?![0-9a-fA-F])/g;
      let eslesme = uuidRe.exec(tum);
      while (eslesme !== null) {
        uuidAraliklari.push([eslesme.index, eslesme.index + eslesme[0].length]);
        eslesme = uuidRe.exec(tum);
      }
    }
    while (uuidImlec < uuidAraliklari.length && uuidAraliklari[uuidImlec][1] <= bas) uuidImlec += 1;
    return uuidImlec < uuidAraliklari.length && uuidAraliklari[uuidImlec][0] < son;
  };

  // Aday, 32+ karakterlik küçük harfli onaltılık bir dizinin (commit,
  // sha256 özeti) parçası mı? Büyük harf sayılmaz: numaranın peşine
  // yapışan AD SOYAD büyük harftir ve korumayı açmamalıdır.
  const onaltilikIcinde = function (bas, son, tum) {
    let sol = bas;
    while (sol > 0 && bas - sol < 64 && kucukOnaltilikMi(tum.charCodeAt(sol - 1))) sol -= 1;
    let sag = son;
    while (sag < tum.length && sag - son < 64 && kucukOnaltilikMi(tum.charCodeAt(sag))) sag += 1;
    return sag - sol >= 32;
  };

  // Koşunun başındaki aday bir ondalık kesrin devamı mı ("0.4111…",
  // "12.3456…", "0,4111…")? Tam sayı kısmı 1-4 hane olmalı; daha uzunsa
  // nokta iki numarayı ayıran bir ayraçtır, koruma açılmaz.
  const ondalikMi = function (konum, tum) {
    if (konum < 2) return false;
    const ayrac = tum.charCodeAt(konum - 1);
    if (ayrac !== 46 && ayrac !== 44) return false;
    let i = konum - 2;
    let hane = 0;
    while (i >= 0 && rakamMi(tum.charCodeAt(i)) && hane < 5) {
      hane += 1;
      i -= 1;
    }
    if (hane === 0 || hane > 4) return false;
    if (i >= 0 && tum.charCodeAt(i) === 46) return false;
    if (ayrac === 44) return hane === 1 && tum.charCodeAt(konum - 2) === 48;
    return true;
  };

  const etiketRe = /(?:kart|card)[ _]?(?:no|numaras[\u0131i]|number|num)?\.?[ \t]*[:=#]?[ \t]*$/i;

  let kartAdet = 0;
  // Ayraçlar: boşluk, sekme, bölünmez/ince boşluk (PDF dökümü), tire,
  // kısa çizgi; bir de araç girdisinin JSON hâlindeki iki karakterlik "\t".
  sonuc = sonuc.replace(
    /\d(?:(?:[ \t\u00a0\u2009\u202f\u2013-]|\\t){0,3}\d){12,}/g,
    function (kosu, konum, tum) {
      // Koşuyu rakam gruplarına böl: [baş, son) çiftleri, koşunun içinde.
      const gruplar = [];
      let grupBasi = -1;
      let hepsiTekHane = true;
      for (let i = 0; i <= kosu.length; i += 1) {
        const rakam = i < kosu.length && rakamMi(kosu.charCodeAt(i));
        if (rakam && grupBasi === -1) grupBasi = i;
        if (!rakam && grupBasi !== -1) {
          if (i - grupBasi !== 1) hepsiTekHane = false;
          gruplar.push([grupBasi, i]);
          grupBasi = -1;
        }
      }
      const uzunluk = function (i) {
        return gruplar[i][1] - gruplar[i][0];
      };
      const arti = konum >= 1 && tum.charCodeAt(konum - 1) === 43;

      // Harf aralıklı yazım: "4 1 1 1 …" — her grup tek hane.
      if (hepsiTekHane && gruplar.length >= 13 && gruplar.length <= 19) {
        if (!arti && kartMi(kosu.replace(/\D/g, ""))) {
          kartAdet += 1;
          return "[GİZLİ:kart_numarasi]";
        }
        return kosu;
      }

      // IBAN koruması.
      //   · TR biçimi [2,4,4,4,4,4,2]: önek nasıl yazılmış olursa olsun
      //     ("TR12 …", "tr12 …", "TR 12 …", öneksiz) IBAN'dır.
      //   · Rakama BİTİŞİK ülke kodu + 2 denetim hanesi: o ülkenin IBAN
      //     uzunluğu kadar hane atlanır; koşu o kadar uzun değilse IBAN
      //     değildir, koruma açılmaz.
      //   · "TR"/"tr" öneki (araya tek boşluk girebilir) + en az 24 hane:
      //     gruplama ne olursa olsun ilk 24 hane IBAN gövdesidir.
      let g = 0;
      if (
        gruplar.length >= 7 &&
        uzunluk(0) === 2 && uzunluk(1) === 4 && uzunluk(2) === 4 && uzunluk(3) === 4 &&
        uzunluk(4) === 4 && uzunluk(5) === 4 && uzunluk(6) === 2
      ) {
        g = 7;
      } else if (konum >= 2 && /(?:^|[^A-Za-z])tr ?$/i.test(tum.slice(Math.max(0, konum - 4), konum))) {
        let atlanan = 0;
        let k = 0;
        while (k < gruplar.length && atlanan < 24) {
          atlanan += uzunluk(k);
          k += 1;
        }
        if (atlanan >= 24) g = k;
      } else if (konum >= 2 && uzunluk(0) === 2) {
        const h1 = tum.charCodeAt(konum - 2);
        const h2 = tum.charCodeAt(konum - 1);
        const h0 = konum >= 3 ? tum.charCodeAt(konum - 3) : 0;
        const ulke = tum.slice(konum - 2, konum);
        if (
          buyukHarfMi(h1) && buyukHarfMi(h2) && !harfMi(h0) &&
          Object.prototype.hasOwnProperty.call(IBAN_RAKAM, ulke)
        ) {
          let atlanan = 0;
          let k = 0;
          while (k < gruplar.length && atlanan < IBAN_RAKAM[ulke]) {
            atlanan += uzunluk(k);
            k += 1;
          }
          if (atlanan >= IBAN_RAKAM[ulke]) g = k;
        }
      }

      // 4-4-4-4 penceresi g'de kart mı?
      const dortluPencere = function (i) {
        if (i + 4 > gruplar.length) return false;
        let rakamlar = "";
        for (let k = 0; k < 4; k += 1) {
          if (uzunluk(i + k) !== 4) return false;
          rakamlar += kosu.slice(gruplar[i + k][0], gruplar[i + k][1]);
        }
        return kartMi(rakamlar);
      };

      let cikti = "";
      let yazilan = 0;
      let bulundu = false;
      while (g < gruplar.length) {
        const boy = uzunluk(g);
        const bas = gruplar[g][0];
        let son = -1;
        let sonrakiGrup = g + 1;
        let tekParca = false;

        if (boy >= 13 && boy <= 19 && kartMi(kosu.slice(bas, gruplar[g][1]))) {
          son = gruplar[g][1];
          tekParca = true;
        } else if (boy >= 17 && boy <= 40 && etiketRe.test(tum.slice(Math.max(0, konum + bas - 28), konum + bas))) {
          // Etiketli bitişik alan: grubun BAŞINDAN 16, olmazsa 15 hane.
          if (kartMi(kosu.slice(bas, bas + 16))) son = bas + 16;
          else if (kartMi(kosu.slice(bas, bas + 15))) son = bas + 15;
        } else if (boy === 4) {
          for (const bicim of KART_BICIMLERI) {
            if (g + bicim.length > gruplar.length) continue;
            let uyar = true;
            let rakamlar = "";
            for (let k = 0; k < bicim.length; k += 1) {
              if (uzunluk(g + k) !== bicim[k]) {
                uyar = false;
                break;
              }
              rakamlar += kosu.slice(gruplar[g + k][0], gruplar[g + k][1]);
            }
            if (uyar && kartMi(rakamlar)) {
              let bitisGrubu = g + bicim.length - 1;
              // Kayan pencere: bulunan adayın İÇİNDEN başlayan başka bir
              // 4-4-4-4 de kartsa ikisi tek parça silinir. Yoksa öndeki
              // iki grup sahte bir aday kurup gerçek numaranın son sekiz
              // hanesini açıkta bırakabilirdi.
              let tara = g + 1;
              while (tara <= bitisGrubu) {
                if (dortluPencere(tara) && tara + 3 > bitisGrubu) bitisGrubu = tara + 3;
                tara += 1;
              }
              son = gruplar[bitisGrubu][1];
              sonrakiGrup = bitisGrubu + 1;
              break;
            }
          }
        }

        if (son !== -1) {
          const mutlakBas = konum + bas;
          const mutlakSon = konum + son;
          const korunan =
            (bas === 0 && (arti || ondalikMi(konum, tum))) ||
            uuidIcinde(mutlakBas, mutlakSon, tum) ||
            (tekParca && onaltilikIcinde(mutlakBas, mutlakSon, tum));
          if (!korunan) {
            cikti += kosu.slice(yazilan, bas) + "[GİZLİ:kart_numarasi]";
            yazilan = son;
            kartAdet += 1;
            bulundu = true;
            g = sonrakiGrup;
            continue;
          }
        }
        g += 1;
      }

      if (!bulundu) return kosu;
      return cikti + kosu.slice(yazilan);
    },
  );
  say("kart_numarasi", kartAdet);

  // Güvenlik kodu ve son kullanma tarihi tek başına tanınamaz (üç hane,
  // "09/28"); yalnız ANAHTAR KELİMENİN yanında gider. Kelime kalır.
  // Ayraç satır içinde kalır (satır sonu ayraç değildir) ve en çok 8
  // karakterdir: `card[cvc]=123`, iç içe JSON'daki `\"cvc\": \"123\"`.
  // Türkçe harfler kaçışla yazıldı: \u00fc ü · \u0130 İ · \u0131 ı · \u00e7 ç.
  let kodAdet = 0;
  sonuc = sonuc.replace(
    /((?:cvv2?|cvc2?|g[\u00fcu]venl[i\u0130\u0131]k[ _]?kodu|security[ _]?code)(?:[ _]?(?:kodu|code|no|numaras[\u0131i]|val(?:ue)?))?)([ \t:=\-"'\\.[\]()]{0,8})\d{3,4}(?!\d)/gi,
    function (_tam, kelime, ayirac) {
      kodAdet += 1;
      return kelime + ayirac + "[GİZLİ:kart_kodu]";
    },
  );
  say("kart_kodu", kodAdet);

  // Tarih: AA/YY, AA/YYYY ya da bitişik AAYY; yıl 24-45 arasında (aralık,
  // "12/12" ve "10/15 dakika" gibi kesirleri dışarıda bırakır).
  let sktAdet = 0;
  sonuc = sonuc.replace(
    /(?<![A-Za-z0-9])(s\.?k\.?t\.?|son[ _]kul(?:lanma|\.)?(?:[ _]?tar(?:[i\u0130]h[i\u0130]|\.)?)?|expir(?:y|es|ation)(?:[ _]?date)?|exp\.?(?:[ _]?date)?|valid[ _]thru|ge[\u00e7c]erl[i\u0130]l[i\u0130]k(?:[ _]tar[i\u0130]h[i\u0130])?|(?:mm|aa) ?\/ ?(?:yyyy|yy))([ \t:=\-"'\\.[\]()]{0,8})(?:(?:0?[1-9]|1[0-2]) ?\/ ?|(?:0[1-9]|1[0-2]))(?:20)?(?:2[4-9]|3\d|4[0-5])(?![\d\/-])/gi,
    function (_tam, kelime, ayirac) {
      sktAdet += 1;
      return kelime + ayirac + "[GİZLİ:kart_skt]";
    },
  );
  say("kart_skt", sktAdet);

  // AD=DEĞER: ADI kalır (hangi anahtarın konuşulduğu bilinmeli), değer
  // gider. Zaten süzülmüş bir değere ikinci kez dokunulmaz — yoksa aynı
  // sır iki kez sayılır ve türü kaybolurdu.
  // Doğrusal süre: AD, kelime başından [A-Z0-9_] koşusunun SONUNA kadardır
  // (ardından gelen \s, "=" ya da ":" sınıfta yok, daha kısa AD tutmaz).
  // Eski `[A-Z0-9_]*(KEY…)[A-Z0-9_]*` iki yıldızı aynı koşuyu bölüşmeyi
  // deniyordu: "KEYKEY…" tek kelimesinde karesel. Şimdi anahtar kelime bir
  // ön bakışla aranır, koşu ön bakış + geri başvuruyla atomik alınır.
  // Grup numaraları aynı: 1 AD · 2 ayraç · 3 tırnak · 4 değer.
  let atamaAdet = 0;
  sonuc = sonuc.replace(
    /\b(?=[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD))(?=([A-Z0-9_]+))\1(\s*[=:]\s*)("|'|)(?!\[GİZLİ:)([^\s'"]{8,})\3/g,
    function (_tam, ad, ayirac, tirnak) {
      atamaAdet += 1;
      return ad + ayirac + tirnak + "[GİZLİ:anahtar_degeri]" + tirnak;
    },
  );
  say("anahtar_degeri", atamaAdet);

  let toplam = 0;
  for (const tur of Object.keys(sayaclar)) toplam += sayaclar[tur];

  return { metin: sonuc, sayi: toplam, turler: sayaclar };
};

const satirlariAyristir = function (metin, baslangicSira, secenekler) {
  const ayar = secenekler || {};
  const gelenDurum = ayar.durum && typeof ayar.durum === "object" ? ayar.durum : {};
  const tavan = typeof ayar.metinTavani === "number" && ayar.metinTavani > 0 ? ayar.metinTavani : 200000;
  const suz = typeof ayar.gizliSuz === "function" ? ayar.gizliSuz : null;
  const fiyatla = typeof ayar.maliyetHesapla === "function" ? ayar.maliyetHesapla : null;
  const fiyatTablosu = ayar.fiyatTablosu || null;

  // --- taşınan durum (parçalar arası) ---------------------------------
  // `arac_adlari`: tool_use.id → araç adı. Sonuç bloğu bir SONRAKİ satırda
  // gelir ve nadiren bir sonraki senk parçasına düşer; harita bu yüzden
  // taşınır. SINIRLI: en yeni 60 giriş tutulur (jsonb şişmesin).
  const aracAdlari = {};
  const gelenAraclar = gelenDurum.arac_adlari;
  if (gelenAraclar && typeof gelenAraclar === "object") {
    for (const anahtar of Object.keys(gelenAraclar)) aracAdlari[anahtar] = gelenAraclar[anahtar];
  }
  let sonMesajId = typeof gelenDurum.son_mesaj_id === "string" ? gelenDurum.son_mesaj_id : null;

  // --- yerel mesaj durumu (kanca 15; parçalar arası taşınır) ------------
  // `origin`: bu dosyada geçerli bir origin (msg_id) satırı görüldü mü —
  //   görüldüyse kuyruk satırı ASLA yedek satır üretmez (teslim origin taşır).
  // `idler`: msg_id → onu yazan satırın kimliği (en yeni 30).
  // `yedekler`: yedek yoldan yazılan gövdenin özeti → [yedek kimliği,
  //   eşleşen teslim satırının kimliği | null] (en yeni 20; eşleşme 1:1).
  // `gidenler`: SendMessage tool_use.id → karşı ad (en yeni 20).
  // ⚠ Anahtarlar transkriptten gelir (msg_id, tool_use.id): "__proto__",
  //   "constructor" gibi bir kimlik düz nesnede prototipe takılırdı. Bütün
  //   haritalar PROTOTİPSİZ (`Object.create(null)`) ve okuma `hasOwnProperty` ile.
  const sinirli = function (deger) {
    return typeof deger === "string" && deger.length >= 1 && deger.length <= 200 ? deger : null;
  };
  const kendi = function (harita, anahtar) {
    return Object.prototype.hasOwnProperty.call(harita, anahtar) ? harita[anahtar] : undefined;
  };
  const haritaEkle = function (harita, anahtar, deger, enCok) {
    if (Object.prototype.hasOwnProperty.call(harita, anahtar)) delete harita[anahtar];
    harita[anahtar] = deger;
    const anahtarlar = Object.keys(harita);
    for (let k = 0; k < anahtarlar.length - enCok; k += 1) delete harita[anahtarlar[k]];
  };
  const dizgeHaritasi = function (ham, enCok) {
    const sonuc = Object.create(null);
    if (!ham || typeof ham !== "object" || Array.isArray(ham)) return sonuc;
    for (const anahtar of Object.keys(ham)) {
      if (sinirli(anahtar) !== null && sinirli(ham[anahtar]) !== null) haritaEkle(sonuc, anahtar, ham[anahtar], enCok);
    }
    return sonuc;
  };
  const gelenYerel = gelenDurum.yerel_mesaj && typeof gelenDurum.yerel_mesaj === "object" && !Array.isArray(gelenDurum.yerel_mesaj)
    ? gelenDurum.yerel_mesaj
    : null;
  let yerelOrigin = gelenYerel !== null && gelenYerel.origin === true;
  const yerelIdler = dizgeHaritasi(gelenYerel ? gelenYerel.idler : null, 30);
  const yerelGidenler = dizgeHaritasi(gelenYerel ? gelenYerel.gidenler : null, 20);
  const yerelYedekler = Object.create(null);
  const gelenYedekler = gelenYerel ? gelenYerel.yedekler : null;
  if (gelenYedekler && typeof gelenYedekler === "object" && !Array.isArray(gelenYedekler)) {
    for (const anahtar of Object.keys(gelenYedekler)) {
      const ikili = gelenYedekler[anahtar];
      if (Array.isArray(ikili) && sinirli(ikili[0]) !== null && (ikili[1] === null || sinirli(ikili[1]) !== null)) {
        haritaEkle(yerelYedekler, anahtar, [ikili[0], ikili[1]], 20);
      }
    }
  }
  // Bu çağrıda kayıt üreten msg_id'ler ve yedek gövde özetleri.
  const buCagriIdler = Object.create(null);
  const buCagriYedekler = Object.create(null);
  // Satırı YAZILAN ama yerel mesaj işareti alamayan durumlar (bozuk origin,
  // tekrar, bozuk giden, bilinmeyen alıcı). `atlanan` yalnız satır üretmeyen
  // kayıtları sayar; ikisi karışmaz (Ek 3 madde 8).
  const yerelUyari = {};

  const atlanan = {};
  const suzulenTurler = {};
  let hatali = 0;
  let sidechain = 0;
  let bilinmeyenBlok = 0;
  let suzulen = 0;
  // Bu metinde görülen SON `custom-title` adı (§3.1); yoksa null.
  let pencereAdi = null;
  let sira = typeof baslangicSira === "number" && baslangicSira >= 0 ? baslangicSira : 0;

  const mesajlar = [];

  const atla = function (ad) {
    atlanan[ad] = (atlanan[ad] || 0) + 1;
  };

  const aracKaydet = function (id, ad) {
    if (typeof id !== "string" || typeof ad !== "string") return;
    aracAdlari[id] = ad;
    const anahtarlar = Object.keys(aracAdlari);
    if (anahtarlar.length > 60) {
      for (let i = 0; i < anahtarlar.length - 60; i += 1) delete aracAdlari[anahtarlar[i]];
    }
  };

  // Blok dizisindeki metin parçalarını birleştirir (tool_result içeriği
  // dizge ya da blok dizisi olabilir; ölçüm: 303 dizge, 15 text dizisi,
  // 4 `tool_reference` dizisi).
  const icerikMetni = function (icerik) {
    if (typeof icerik === "string") return icerik;
    if (!Array.isArray(icerik)) return "";
    const parcalar = [];
    for (const parca of icerik) {
      if (!parca || typeof parca !== "object") continue;
      if (typeof parca.text === "string") parcalar.push(parca.text);
      else if (parca.type === "tool_reference" && typeof parca.tool_name === "string") {
        parcalar.push("[araç başvurusu: " + parca.tool_name + "]");
      } else if (typeof parca.type === "string") {
        parcalar.push("[" + parca.type + "]");
      }
    }
    return parcalar.join("\n");
  };

  const ekAdi = function (blok) {
    const kaynak = blok && blok.source ? blok.source : null;
    const tur = kaynak && typeof kaynak.media_type === "string" ? kaynak.media_type : blok.type;
    const baslik = blok && typeof blok.title === "string" && blok.title.length > 0 ? " · " + blok.title : "";
    return "[ek: " + tur + baslik + "]";
  };

  const kes = function (deger) {
    if (typeof deger !== "string") return null;
    if (deger.length <= tavan) return deger;
    return deger.slice(0, tavan - 14) + "\n[… kesildi]";
  };

  const parcalar = metin.split("\n");
  let ofset = 0;

  // Tek satır kalıbı: süzgeç + tavan + sabit anahtar sırası. Bütün satırlar
  // (blok satırları ve kanca 15'in yerel mesaj satırları) buradan doğar.
  const satirKur = function (uuid, zaman, rol, tur, hamGovde, aracAdi) {
    let govde = hamGovde;
    let blokSuzulen = 0;
    if (suz) {
      const suzulmus = suz(govde);
      govde = suzulmus.metin;
      blokSuzulen = suzulmus.sayi;
      suzulen += suzulmus.sayi;
      for (const t of Object.keys(suzulmus.turler)) {
        suzulenTurler[t] = (suzulenTurler[t] || 0) + suzulmus.turler[t];
      }
    }
    return {
      uuid: uuid,
      sira: sira,
      zaman: zaman,
      rol: rol,
      tur: tur,
      metin: kes(govde),
      arac_adi: aracAdi,
      girdi_token: null,
      cikti_token: null,
      cache_okuma: null,
      cache_yazma: null,
      cache_yazma_1s: null,
      hiz: null,
      bolge: null,
      maliyet_usd: null,
      premium_istek: false,
      _model: null,
      // `_` önekli alanlar DB kolonu DEĞİLDİR: `_ofset` kancanın parça
      // sınırını, `_suzulen` parça başına süzülme sayısını, `_model`
      // sunucunun maliyeti kendi TAZE tablosuyla yeniden hesaplamasını
      // sağlar. Üçü de `mesaj` satırına yazılmadan önce ayıklanır.
      _ofset: ofset,
      _suzulen: blokSuzulen,
    };
  };

  // --- yerel mesaj yardımcıları (kanca 15) -------------------------------
  const YEREL_ETIKET = "<cross-session-message";
  const YEREL_KAPANIS = "</cross-session-message>";

  // Kriptografik DEĞİL: yalnız tekrar anahtarı ve yedek satırın kararlı
  // kimliği için 64 bitlik özet (cyrb53 türevi). Sunucunun `metin_ozeti`
  // (SHA-256) bu değildir.
  const ozetle = function (deger) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let k = 0; k < deger.length; k += 1) {
      const c = deger.charCodeAt(k);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return ("0000000" + (h2 >>> 0).toString(16)).slice(-8) + ("0000000" + (h1 >>> 0).toString(16)).slice(-8);
  };

  // origin → null (aday değil) · { bozuk: true } · { msgId, ad, govde }.
  // Aday: `msg_id` anahtarı var YA DA (kind "peer" + metinde etiket). Alt ajan
  // dönüşü de "peer"dir ama ne msg_id ne etiket taşır → aday değil.
  const yerelGelenCoz = function (origin, metinParcasi) {
    if (!origin || typeof origin !== "object" || Array.isArray(origin)) return null;
    const msgIdVar = Object.prototype.hasOwnProperty.call(origin, "msg_id");
    const etiketli = origin.kind === "peer" && typeof metinParcasi === "string" && metinParcasi.indexOf(YEREL_ETIKET) !== -1;
    if (!msgIdVar && !etiketli) return null;
    const msgId = sinirli(origin.msg_id);
    const ad = sinirli(origin.name);
    if (msgId === null || ad === null || typeof origin.body !== "string") return { bozuk: true };
    return { msgId: msgId, ad: ad, govde: origin.body };
  };

  // Geçerli gelen mesaj kayıt üretmeli mi? false = tekrar. `kimlik` satırın
  // kendi kimliğidir: aynı kimlik yeniden okunuyorsa (parça düştü) yine
  // üretilir, sunucu `(seans_id, uuid)` ile atlar.
  const yerelGelenKaydet = function (cozum, kimlik) {
    yerelOrigin = true;
    if (kendi(buCagriIdler, cozum.msgId) === true) return false;
    const onceki = kendi(yerelIdler, cozum.msgId);
    if (onceki !== undefined && onceki !== kimlik) return false;
    buCagriIdler[cozum.msgId] = true;
    haritaEkle(yerelIdler, cozum.msgId, kimlik, 30);
    // Aynı mesaj daha önce kuyruk satırından YEDEK olarak yazıldıysa (tur
    // sonu araya girdi), teslim satırı ikinci kayıt üretmez. Eşleşme 1:1.
    const yedek = kendi(yerelYedekler, ozetle(cozum.govde));
    if (yedek !== undefined && (yedek[1] === null || yedek[1] === kimlik)) {
      yedek[1] = kimlik;
      return false;
    }
    return true;
  };

  // `<cross-session-message from="…" from-name="AD" …>\nMETİN\n</…>`
  // → { ad, govde } ya da null. Nitelik sırası serbest; ad XML varlıkları
  // çözülür; gövde baştaki ve sondaki TEK satır sonundan arındırılır (ölçüm:
  // iç metin = "\n" + origin.body + "\n").
  const etiketCoz = function (icerik) {
    const acilis = /^<cross-session-message((?:\s+[A-Za-z_][-A-Za-z0-9_:.]*="[^"]*")*)\s*>/.exec(icerik);
    if (!acilis) return null;
    const son = icerik.lastIndexOf(YEREL_KAPANIS);
    if (son < acilis[0].length) return null;
    if (icerik.slice(son + YEREL_KAPANIS.length).trim().length > 0) return null;
    const adEsles = /\sfrom-name="([^"]*)"/.exec(acilis[1]);
    if (!adEsles) return null;
    const ad = sinirli(adEsles[1].replace(/&(quot|apos|lt|gt|amp);/g, function (_tam, varlik) {
      return varlik === "quot" ? "\"" : varlik === "apos" ? "'" : varlik === "lt" ? "<" : varlik === "gt" ? ">" : "&";
    }));
    if (ad === null) return null;
    let govde = icerik.slice(acilis[0].length, son);
    if (govde.charAt(0) === "\n") govde = govde.slice(1);
    if (govde.charAt(govde.length - 1) === "\n") govde = govde.slice(0, -1);
    return { ad: ad, govde: govde };
  };

  // Bu çağrının KALAN satırlarında geçerli bir origin teslimi var mı? Yalnız
  // ilk etiketli kuyruk satırında ve bayrak kapalıyken bir kez taranır.
  // Geçerlilik ANA YOLLA AYNI (Ek 3 madde 8): user satırı `message` nesnesi ve
  // metin bloğu taşımalı — ana yolda alan alamayacak (bozuk sayılacak) bir
  // teslim yedeği bastırmaz, yoksa mesaj hiç kaydolmazdı.
  let ileriTarandi = false;
  const yerelOriginIleride = function (baslangic) {
    if (yerelOrigin) return true;
    if (ileriTarandi) return false;
    ileriTarandi = true;
    for (let j = baslangic + 1; j < parcalar.length; j += 1) {
      if (parcalar[j].indexOf("\"msg_id\"") === -1) continue;
      let aday = null;
      try {
        aday = JSON.parse(parcalar[j]);
      } catch {
        continue;
      }
      if (!aday || typeof aday !== "object") continue;
      const ek = aday.attachment;
      let origin = null;
      if (aday.type === "user") {
        const ileti = aday.message;
        if (ileti && typeof ileti === "object" && metinBloguVar(ileti.content)) origin = aday.origin;
      } else if (aday.type === "attachment" && ek && typeof ek === "object" && ek.type === "queued_command") {
        origin = ek.origin;
      }
      const cozum = yerelGelenCoz(origin, null);
      if (cozum !== null && cozum.bozuk !== true) {
        yerelOrigin = true;
        return true;
      }
    }
    return false;
  };

  // Ana yoldaki blok kuralının aynısı: dizi değilse tek metin bloğu sayılır.
  const metinBloguVar = function (icerik) {
    if (!Array.isArray(icerik)) return true;
    for (const blok of icerik) if (blok && blok.type === "text") return true;
    return false;
  };

  const uyar = function (ad) {
    yerelUyari[ad] = (yerelUyari[ad] || 0) + 1;
  };

  // `user`/`assistant` DIŞINDAKİ satır. true = işlendi (satır üretti ya da
  // "yerel_mesaj:*" nedeniyle sayıldı); false = eski yol (`atla(satirTuru)`).
  const yerelSatirIsle = function (kayit, satirTuru, satirNo) {
    const zaman = typeof kayit.timestamp === "string" ? kayit.timestamp : null;

    if (satirTuru === "attachment") {
      // ⚠ YALNIZ queued_command: `deferred_tools_record` araç açıklamasıdır,
      //   içinde etiket geçer; asla alınmaz (ölçüm: 182-205 satır gürültü).
      const ek = kayit.attachment;
      if (!ek || typeof ek !== "object" || ek.type !== "queued_command") return false;
      const cozum = yerelGelenCoz(ek.origin, icerikMetni(ek.prompt));
      if (cozum === null) return false;
      if (cozum.bozuk === true) {
        atla("yerel_mesaj:bozuk_origin");
        return true;
      }
      const kimlik = typeof kayit.uuid === "string" && kayit.uuid.length > 0 ? kayit.uuid : "attachment-" + String(ofset);
      if (!yerelGelenKaydet(cozum, kimlik)) {
        atla("yerel_mesaj:tekrar");
        return true;
      }
      const mesaj = satirKur(kimlik + "#0", zaman, "sistem", "metin", cozum.govde, null);
      mesaj.yerel_mesaj = { yon: "gelen", karsi_ad: cozum.ad, msg_id: cozum.msgId };
      mesajlar.push(mesaj);
      sira += 1;
      return true;
    }

    if (satirTuru === "queue-operation") {
      if (typeof kayit.content !== "string" || kayit.content.indexOf(YEREL_ETIKET) !== 0) return false;
      if (kayit.operation === "remove") {
        // Aynı mesajın kuyruktan çıkışı (ölçüm: reason "absorbed_mid_turn").
        atla("yerel_mesaj:kuyruk_remove");
        return true;
      }
      if (kayit.operation !== "enqueue") {
        atla("yerel_mesaj:kuyruk");
        return true;
      }
      const et = etiketCoz(kayit.content);
      if (et === null) {
        atla("yerel_mesaj:bozuk_etiket");
        return true;
      }
      // Kuyruk satırının uuid'i YOK (ölçüldü): kimlik zaman + içerikten
      // türetilir, böylece yeniden okumada aynı satır aynı kimliği alır.
      const kimlik = "kuyruk-" + ozetle((zaman || "") + "\n" + kayit.content);
      const anahtar = ozetle(et.govde);
      if (kendi(buCagriYedekler, anahtar) === true) {
        atla("yerel_mesaj:tekrar");
        return true;
      }
      const kayitli = kendi(yerelYedekler, anahtar);
      if (kayitli === undefined || kayitli[0] !== kimlik) {
        if (kayitli !== undefined) {
          atla("yerel_mesaj:tekrar");
          return true;
        }
        // Dosya origin biçimini gösterdiyse teslim satırı origin taşıyacak:
        // yedek yok (araya tur sonu girse bile ikinci kayıt doğmaz).
        if (yerelOriginIleride(satirNo)) {
          atla("yerel_mesaj:kuyruk");
          return true;
        }
      }
      buCagriYedekler[anahtar] = true;
      haritaEkle(yerelYedekler, anahtar, [kimlik, kayitli !== undefined ? kayitli[1] : null], 20);
      const mesaj = satirKur(kimlik + "#0", zaman, "sistem", "metin", et.govde, null);
      mesaj.yerel_mesaj = { yon: "gelen", karsi_ad: et.ad };
      mesajlar.push(mesaj);
      sira += 1;
      return true;
    }

    return false;
  };

  // `SendMessage` sonuç satırının oturumlar arası teslim kimliği: satırda TEK
  // sonuç bloğu ve geçerli `toolUseResult.msg_id` (ana yolla aynı kural).
  const sonucMsgId = function (kayit) {
    const ileti = kayit && kayit.message;
    if (!ileti || typeof ileti !== "object" || !Array.isArray(ileti.content)) return null;
    let sonucBloklari = 0;
    for (const blok of ileti.content) if (blok && blok.type === "tool_result") sonucBloklari += 1;
    if (sonucBloklari !== 1) return null;
    const sonuc = kayit.toolUseResult;
    return sonuc && typeof sonuc === "object" && !Array.isArray(sonuc) ? sinirli(sonuc.msg_id) : null;
  };

  // `recipient_kind`'siz çağrının KANITI: aynı çağrının kalan satırlarında bu
  // tool_use.id'nin sonucu `msg_id` taşıyor mu. Ölçüm (13 Eki): alan CC
  // 2.1.292'den beri HER çağrıda var, öncesinde hiçbirinde; alansız oturumlar
  // arası 8 gönderimin 8'inin sonucu msg_id taşıyor ve HEMEN sonraki satırda;
  // alansız 114 alt ajan gönderiminin hiçbiri taşımıyor.
  const sonuctaMsgIdVar = function (aracId, baslangic) {
    for (let j = baslangic + 1; j < parcalar.length; j += 1) {
      if (parcalar[j].indexOf(aracId) === -1) continue;
      let aday = null;
      try {
        aday = JSON.parse(parcalar[j]);
      } catch {
        continue;
      }
      if (!aday || aday.type !== "user" || !aday.message || !Array.isArray(aday.message.content)) continue;
      let buSonuc = false;
      for (const blok of aday.message.content) {
        if (blok && blok.type === "tool_result" && blok.tool_use_id === aracId) buSonuc = true;
      }
      if (buSonuc) return sonucMsgId(aday) !== null;
    }
    return false;
  };

  // Giden: `SendMessage` çağrısı. Yalnız `recipient_kind` "name" / "session"
  // doğrudan kabul (Ek 3 madde 7). "agent" alt ajandır. Alan YOKSA (CC <
  // 2.1.292) giden yalnız sonucun `msg_id`'siyle kanıtlanırsa sayılır: ad hedefli
  // takım/alt ajan gönderimi yanlış pozitif olmaz, eski oturumlar arası gönderim
  // de kaybolmaz.
  const yerelGidenCagri = function (blok, satirNo) {
    const girdi = blok.input;
    if (!girdi || typeof girdi !== "object" || Array.isArray(girdi)) {
      uyar("bozuk_giden");
      return null;
    }
    const tur = girdi.recipient_kind;
    if (tur === "agent") return null;
    const hedef = sinirli(girdi.to);
    if (hedef === null) {
      uyar("bozuk_giden");
      return null;
    }
    const aracId = typeof blok.id === "string" && blok.id.length > 0 ? blok.id : null;
    if (tur === undefined) {
      if (/^a[0-9a-f]{16}$/.test(hedef)) return null;
      if (aracId === null || !sonuctaMsgIdVar(aracId, satirNo)) return null;
    } else if (tur !== "name" && tur !== "session") {
      uyar("bilinmeyen_alici");
      return null;
    }
    if (aracId !== null) haritaEkle(yerelGidenler, aracId, hedef, 20);
    return { yon: "giden", karsi_ad: hedef };
  };

  // Giden sonucu: `toolUseResult.msg_id` (alıcının origin.msg_id'si) varsa.
  // Haritadan SİLİNMEZ: parça düşüp satır yeniden okunursa yine bulunur.
  const yerelGidenSonuc = function (kimlik, sonuc) {
    const karsiAd = kendi(yerelGidenler, kimlik);
    if (karsiAd === undefined) return null;
    const msgId = sonuc && typeof sonuc === "object" && !Array.isArray(sonuc) ? sinirli(sonuc.msg_id) : null;
    if (msgId === null) return null;
    return { yon: "giden", karsi_ad: karsiAd, msg_id: msgId };
  };

  for (let i = 0; i < parcalar.length; i += 1) {
    const satir = parcalar[i];
    const sonMu = i === parcalar.length - 1;
    ofset += Buffer.byteLength(satir, "utf8") + (sonMu ? 0 : 1);
    if (satir.trim().length === 0) continue;

    let kayit = null;
    try {
      kayit = JSON.parse(satir);
    } catch {
      hatali += 1;
      continue;
    }
    if (!kayit || typeof kayit !== "object" || Array.isArray(kayit)) {
      hatali += 1;
      continue;
    }

    const satirTuru = typeof kayit.type === "string" ? kayit.type : "(tursuz)";
    if (satirTuru !== "user" && satirTuru !== "assistant") {
      // Kullanıcının verdiği pencere adı: sonuncusu geçerli, satır yine
      // atlanır ve sayılır. `ai-title` burada bilerek YOKTUR.
      if (satirTuru === "custom-title" && typeof kayit.customTitle === "string") {
        pencereAdi = kayit.customTitle;
      }
      // Kanca 15: `attachment:queued_command` + origin ve etiketli
      // `queue-operation` burada işlenir; tanınmayan her satır eski yoldan.
      if (!yerelSatirIsle(kayit, satirTuru, i)) atla(satirTuru);
      continue;
    }

    const ileti = kayit.message;
    if (!ileti || typeof ileti !== "object") {
      atla(satirTuru + ":mesajsiz");
      continue;
    }

    if (kayit.isSidechain === true) sidechain += 1;

    const kullanici = satirTuru === "user";
    const zaman = typeof kayit.timestamp === "string" ? kayit.timestamp : null;
    const satirUuid = typeof kayit.uuid === "string" && kayit.uuid.length > 0
      ? kayit.uuid
      : satirTuru + "-" + String(ofset);

    // --- usage: satırın ilk bloğuna VE message.id'nin ilk satırına -----
    const mesajId = typeof ileti.id === "string" ? ileti.id : null;
    const blokSirasi = typeof kayit.apiBlockIndex === "number" ? kayit.apiBlockIndex : 0;
    const usage = ileti.usage && typeof ileti.usage === "object" ? ileti.usage : null;
    const ilkSatirMi = blokSirasi === 0 && (mesajId === null || mesajId !== sonMesajId);
    if (mesajId !== null) sonMesajId = mesajId;

    const bloklar = Array.isArray(ileti.content)
      ? ileti.content
      : [{ type: "text", text: typeof ileti.content === "string" ? ileti.content : "" }];

    let sonucBlokSayisi = 0;
    for (const blok of bloklar) if (blok && blok.type === "tool_result") sonucBlokSayisi += 1;

    // Kanca 15 — gelen yerel mesaj (`user` + `origin.msg_id`): satır BUGÜNKÜ
    // gibi yazılır, ilk metin satırına `yerel_mesaj` eklenir.
    let yerelGelen = null;
    let yerelEklendi = false;
    if (kullanici && kayit.origin !== undefined) {
      const cozum = yerelGelenCoz(kayit.origin, icerikMetni(ileti.content));
      if (cozum !== null) {
        // Satır YAZILIR: sorun `atlanan`a değil `yerel_uyari`ya (Ek 3 madde 8).
        // Metin bloğu kuralı ileri taramayla ortak (`metinBloguVar`).
        if (cozum.bozuk === true || !metinBloguVar(ileti.content)) uyar("bozuk_origin");
        else if (!yerelGelenKaydet(cozum, satirUuid)) uyar("tekrar");
        else yerelGelen = { yon: "gelen", karsi_ad: cozum.ad, msg_id: cozum.msgId };
      }
    }

    for (let b = 0; b < bloklar.length; b += 1) {
      const blok = bloklar[b] && typeof bloklar[b] === "object" ? bloklar[b] : {};
      const blokTuru = typeof blok.type === "string" ? blok.type : "(tursuz)";

      let rol = kullanici ? "kullanici" : "asistan";
      let tur = "metin";
      let govde = "";
      let aracAdi = null;
      let yerelGiden = null;

      if (blokTuru === "text") {
        govde = typeof blok.text === "string" ? blok.text : "";
      } else if (blokTuru === "thinking") {
        tur = "dusunce";
        govde = typeof blok.thinking === "string" ? blok.thinking : "";
      } else if (blokTuru === "tool_use") {
        tur = "arac_cagrisi";
        aracAdi = typeof blok.name === "string" ? blok.name : null;
        aracKaydet(blok.id, aracAdi);
        if (aracAdi === "SendMessage" && !kullanici) yerelGiden = yerelGidenCagri(blok, i);
        try {
          govde = JSON.stringify(blok.input === undefined ? null : blok.input);
        } catch {
          govde = "[girdi seri hâle getirilemedi]";
        }
      } else if (blokTuru === "tool_result") {
        rol = "arac";
        tur = "arac_sonucu";
        const kimlik = typeof blok.tool_use_id === "string" ? blok.tool_use_id : null;
        aracAdi = kimlik && Object.prototype.hasOwnProperty.call(aracAdlari, kimlik)
          ? aracAdlari[kimlik]
          : null;
        // Gönderilen yerel mesajın kimliği SONUÇ satırının `toolUseResult`ında
        // gelir (ölçüm 27/27); satırda tek sonuç bloğu yoksa kime ait olduğu
        // belirsizdir ve alınmaz (ölçüm: 191/191 satır tek blok).
        if (aracAdi === "SendMessage" && kimlik !== null && sonucBlokSayisi === 1) {
          yerelGiden = yerelGidenSonuc(kimlik, kayit.toolUseResult);
        }
        govde = icerikMetni(blok.content);
        if (blok.is_error === true) govde = "[hata] " + govde;
      } else if (blokTuru === "image" || blokTuru === "document") {
        // ⚠ İKİLİ VERİ ASLA GÖNDERİLMEZ: yalnız yer tutucu. Ekler Faz 2'de
        //   `varlik` tablosuna gider (plan §8 madde 19).
        tur = "ek";
        govde = ekAdi(blok);
      } else {
        tur = "ek";
        govde = "[bilinmeyen blok: " + blokTuru + "]";
        bilinmeyenBlok += 1;
      }

      const mesaj = satirKur(satirUuid + "#" + String(b), zaman, rol, tur, govde, aracAdi);

      if (b === 0 && ilkSatirMi && usage) {
        const tamsayi = function (deger) {
          return typeof deger === "number" && Number.isFinite(deger) ? Math.round(deger) : null;
        };
        mesaj.girdi_token = tamsayi(usage.input_tokens);
        mesaj.cikti_token = tamsayi(usage.output_tokens);
        mesaj.cache_okuma = tamsayi(usage.cache_read_input_tokens);
        mesaj.cache_yazma = tamsayi(usage.cache_creation_input_tokens);
        // 1 saatlik yazım, yazım TOPLAMININ bir parçasıdır: toplam
        // bilinmiyorsa, değer negatifse ya da toplamı aşıyorsa tutarsızdır
        // ve null kalır (uydurulmaz; DB kısıtı `0 <= y1 <= cache_yazma`).
        const kirilim = usage.cache_creation;
        if (kirilim && typeof kirilim === "object") {
          const ham1s = kirilim.ephemeral_1h_input_tokens;
          const deger1s = typeof ham1s === "number" && Number.isFinite(ham1s) ? Math.round(ham1s) : 0;
          mesaj.cache_yazma_1s =
            mesaj.cache_yazma !== null && deger1s >= 0 && deger1s <= mesaj.cache_yazma ? deger1s : null;
        }
        // Hız ve bölge fiyatın girdisidir (sözleşme §6b): saklanır, yorum
        // fiyattadır. Yalnız 1-40 karakterlik dizge; "" dahil başka her şey null.
        const etiket = function (deger) {
          return typeof deger === "string" && deger.length >= 1 && deger.length <= 40 ? deger : null;
        };
        mesaj.hiz = etiket(usage.speed);
        mesaj.bolge = etiket(usage.inference_geo);
        mesaj.premium_istek = usage.service_tier === "priority";
        mesaj._model = typeof ileti.model === "string" ? ileti.model : null;
        if (fiyatla && mesaj._model) {
          mesaj.maliyet_usd = fiyatla(mesaj._model, usage, fiyatTablosu, zaman);
        }
      }

      // Kanca 15: alan YALNIZ tanınan satıra eklenir (anahtar hiç yoksa
      // satır eski biçimin birebir aynısıdır).
      if (yerelGelen !== null && tur === "metin" && !yerelEklendi) {
        mesaj.yerel_mesaj = yerelGelen;
        yerelEklendi = true;
      } else if (yerelGiden !== null) {
        mesaj.yerel_mesaj = yerelGiden;
      }

      mesajlar.push(mesaj);
      sira += 1;
    }
  }

  const oncekiSayac = gelenDurum.sayac && typeof gelenDurum.sayac === "object" ? gelenDurum.sayac : {};
  const oncekiAtlanan = oncekiSayac.atlanan && typeof oncekiSayac.atlanan === "object" ? oncekiSayac.atlanan : {};
  const toplamAtlanan = {};
  for (const anahtar of Object.keys(oncekiAtlanan)) toplamAtlanan[anahtar] = oncekiAtlanan[anahtar];
  for (const anahtar of Object.keys(atlanan)) {
    toplamAtlanan[anahtar] = (toplamAtlanan[anahtar] || 0) + atlanan[anahtar];
  }
  const artir = function (ad, deger) {
    const onceki = typeof oncekiSayac[ad] === "number" ? oncekiSayac[ad] : 0;
    return onceki + deger;
  };

  const durum = {
    son_sira: sira,
    son_mesaj_id: sonMesajId,
    arac_adlari: aracAdlari,
    sayac: {
      mesaj: artir("mesaj", mesajlar.length),
      hatali: artir("hatali", hatali),
      sidechain: artir("sidechain", sidechain),
      bilinmeyen_blok: artir("bilinmeyen_blok", bilinmeyenBlok),
      suzulen_istemci: artir("suzulen_istemci", suzulen),
      atlanan: toplamAtlanan,
    },
  };
  // Kanca 15: `yerel_uyari` (yazılan satırın uyarıları) atlanan gibi BİRİKİR;
  // anahtar yalnız bir uyarı doğduysa var (yerel mesaj görmemiş dosyanın
  // sayacı eskisinin aynısı).
  const oncekiUyari = oncekiSayac.yerel_uyari && typeof oncekiSayac.yerel_uyari === "object" && !Array.isArray(oncekiSayac.yerel_uyari)
    ? oncekiSayac.yerel_uyari
    : {};
  const toplamUyari = {};
  for (const anahtar of Object.keys(oncekiUyari)) {
    if (typeof oncekiUyari[anahtar] === "number") toplamUyari[anahtar] = oncekiUyari[anahtar];
  }
  for (const anahtar of Object.keys(yerelUyari)) {
    toplamUyari[anahtar] = (toplamUyari[anahtar] || 0) + yerelUyari[anahtar];
  }
  if (Object.keys(toplamUyari).length > 0) durum.sayac.yerel_uyari = toplamUyari;
  // Kanca 15: yerel mesaj durumu YALNIZ bir kez doğduysa taşınır; yerel
  // mesaj görmemiş dosyanın durumu eskisinin birebir aynısıdır. Bir kez
  // doğan anahtar boşalsa da gönderilir (sunucu birleştirmesi eskisini tutardı).
  if (
    gelenYerel !== null ||
    yerelOrigin ||
    Object.keys(yerelIdler).length > 0 ||
    Object.keys(yerelYedekler).length > 0 ||
    Object.keys(yerelGidenler).length > 0
  ) {
    durum.yerel_mesaj = {
      origin: yerelOrigin,
      idler: yerelIdler,
      yedekler: yerelYedekler,
      gidenler: yerelGidenler,
    };
  }

  return {
    mesajlar: mesajlar,
    atlanan: atlanan,
    yerelUyari: yerelUyari,
    hatali: hatali,
    suzulen: suzulen,
    suzulenTurler: suzulenTurler,
    pencereAdi: pencereAdi,
    durum: durum,
  };
};

export { maliyetHesapla, gizliSuz, satirlariAyristir, VIBENTO_FIYAT };
