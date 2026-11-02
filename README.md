<img src="vibento/assets/icon.png" width="72" alt="Vibento">

# Vibento eklentisi (Claude Code)

Claude Code oturumlarını [Vibento](https://vibento.app) işlerine bağlar: kaldığın yer, günlük, pencereler arası mesaj.

## Kurulum

En kolayı vibento.app › Bilgisayarlar › Bilgisayar ekle sayfasındaki **Claude Code'a kur** düğmesi. Terminal sürümünde aynısı:

```
/plugin marketplace add cevdetcanver/vibento-eklenti
/plugin install vibento@vibento-eklenti
```

Kurduktan sonra yeni bir Claude Code penceresi aç. Eklenti sekiz harflik bir kod gösterir; kodu vibento.app/bagla sayfasında yaz ve bilgisayarı onayla.

## Eklenti ne yapar

- Oturum olaylarını ve süzgeçten geçmiş sohbet kaydını **senin** Vibento hesabına gönderir. Gizli değer biçimleri göndermeden önce süzülür.
- Açılışta işinin "kaldığımız yer" bilgisini pencereye getirir, başka pencerelerden gelen mesajları iletir.
- Bağlantı anahtarını bilgisayarında tutar (`~/.vibento/mcp-baslik.json` ve Claude Code'un eklenti deposu). Anahtar Vibento dışına gitmez.
- Vibento araçları yalnız Vibento hesabına yazar, bilgisayardaki dosyalara dokunmaz. Okuyan araçlar izin sormaz; yazanlar Claude Code'un olağan iznini sorar.

Bağlantıyı istediğin an vibento.app › Bilgisayarlar sayfasından iptal edebilirsin. Kaldırmak için: `/plugin uninstall vibento@vibento-eklenti`.

Bu depoda gizli bilgi yoktur; iş mantığı Vibento sunucusundadır.
