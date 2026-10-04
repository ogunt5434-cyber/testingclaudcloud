# Diyar Kahramanları

Tarayıcıda çalışan, mobil öncelikli bir **boşta ilerleyen (idle) RPG**. Kahraman topla, 6 kişilik takımını
kur, otomatik savaşlarda enerjiyle dolan aktif yeteneklerini izle, kampanyada ilerle, çevrimdışıyken
ganimet biriktir ve Yankı Kulesi'ne tırman.

- 6 grup, 5 sınıf ve tamamen **özgün** 30 kahraman (isimler, yetenekler, açıklamalar)
- Belirlenimci (deterministik) savaş motoru: aynı tohum her zaman aynı savaşı üretir
- Oyunun tüm metinleri Türkçe; harici görsel yok, her şey emoji ve CSS ile çiziliyor
- TypeScript (strict) + Vite + saf DOM; arayüz kütüphanesi kullanılmıyor

| Kampanya | Savaş | Sonuç | Kahramanlar |
|---|---|---|---|
| ![Kampanya](docs/screenshots/campaign.png) | ![Savaş](docs/screenshots/battle.png) | ![Sonuç](docs/screenshots/result.png) | ![Kahramanlar](docs/screenshots/heroes.png) |

| Kahraman Detayı | Çağrı | Kule |
|---|---|---|
| ![Detay](docs/screenshots/hero-detail.png) | ![Çağrı](docs/screenshots/summon.png) | ![Kule](docs/screenshots/tower.png) |

## Kurulum ve çalıştırma

Node.js 20 veya üstü gerekir.

```bash
npm install        # bağımlılıkları kur
npm run dev        # geliştirme sunucusu (http://localhost:5173)
npm test           # Vitest ile tüm testler
npm run typecheck  # yalnızca TypeScript tip denetimi
npm run build      # tip denetimi + üretim derlemesi (dist/)
npm run preview    # derlenmiş sürümü yerelde sun
```

Kayıt tarayıcının `localStorage` alanında tutulur (`diyar-kahramanlari-save`). Oyunu sıfırlamak için
sağ üstteki ⚙️ **Ayarlar → Oyunu Sıfırla** düğmesini kullan.

Denge simülasyonunun tablosunu görmek için:

```bash
npx vitest run tests/balance.test.ts --silent=false
```

## Proje yapısı

```
docs/
  SPEC.md              Oyun kuralları ve modül sözleşmeleri (tek doğruluk kaynağı)
  screenshots/         Tarayıcı oyun testinden ekran görüntüleri
src/
  main.ts              Giriş noktası: Game'i yükler, arayüzü bağlar
  style.css            Karanlık fantastik tema, mobil yerleşim, animasyonlar
  core/                Oyun mantığı (DOM'dan bağımsız, saf TypeScript)
    types.ts           Paylaşılan tipler (kahraman, savaş olayları, kayıt durumu…)
    constants.ts       Kurallar ve ayar sabitleri (grup üstünlüğü, enerji, zırh…)
    rng.ts             Tohumlanabilir rastgele sayı üreteci
    battle/            Savaş motoru: birim kurulumu, hedefleme, hasar, etkiler,
                       pasifler, tur akışı; giriş: simulateBattle()
    stats.ts           Seviye/yıldız/ekipmana göre statlar ve güç puanı
    progression.ts     Seviye atlatma, yıldız yükseltme, serbest bırakma, ekipman, hesap seviyesi
    summon.ts          Çağrı oranları, garanti (pity) ve kahraman havuzu
    campaign.ts        Aşamalar, zorluk eğrisi, ilk geçiş ödülleri, boşta gelir
    tower.ts           Kule katları ve ödülleri
    enemies.ts         Güç çarpanından düşman takımı üretimi
    formation.ts       Takım doğrulama ve otomatik dizilim
    save.ts            Yeni oyun, kayıt/yükleme, bozuk kayıt temizleme
    game.ts            Game deposu: durum + eylemler, kaydetme ve abonelere bildirme
  data/
    heroes.ts          30 kahramanın tanımları (statlar, aktif ve pasif yetenekler)
    equipment.ts       4 yuva × 6 kademe ekipman
  ui/
    app.ts             Üst çubuk, sekme çubuğu, ekran geçişleri
    screens/           Kampanya, Kahramanlar, Çağır, Kule ekranları
    modals/            Savaş, sonuç, takım düzeni, kahraman detayı, çağrı sonucu, ayarlar
    battle/            Savaş oynatımı: olay modeli, zamanlama, görsel efektler
    components.ts …    Ortak parçalar (portre, kart, düğme, ödül listesi), biçimlendirme, bildirimler
tests/                 Vitest testleri (içerik, savaş + fuzz, sistemler, kayıt, denge, arayüz mantığı)
```

Mimari kural: `core/` ve `data/` hiçbir zaman DOM'a dokunmaz; arayüz yalnızca `Game` deposunun
sorgularını ve eylemlerini kullanır. Başarılı her eylem durumu kaydeder ve arayüzü yeniden çizer.

## Oynanış rehberi

### Gruplar ve üstünlük döngüsü

| Grup | Simge | Üstün olduğu grup |
|---|---|---|
| Uçurum | 🔥 | Orman |
| Orman | 🌿 | Gölge |
| Gölge | 🌑 | Kale |
| Kale | 🏰 | Uçurum |
| Işık | ☀️ | Karanlık |
| Karanlık | 💀 | Işık |

Döngü: **Uçurum → Orman → Gölge → Kale → Uçurum**, ayrıca **Işık ↔ Karanlık** birbirine üstündür.
Üstün olduğun gruba saldırırken **+%30 hasar** ve **+%15 isabet** kazanırsın.

Sınıflar: **Savaşçı** (ön sıra tankı), **Büyücü** (alan hasarı), **Okçu** (tek hedef / çoklu vuruş),
**Suikastçı** (kritik ve arka sırayı / düşük canlıyı hedefler), **Rahip** (iyileştirme, güçlendirme, enerji).
Her grupta her sınıftan bir kahraman vardır.

### Takım ve savaş

- Takım 6 yuvadan oluşur: **2 ön sıra** ve **4 arka sıra**. Normal saldırılar önce ön sırayı hedefler,
  bu yüzden dayanıklı savaşçıları öne koy. **Takım → Otomatik** en güçlü 6 kahramanı yerleştirir.
- Savaşlar otomatiktir ve en fazla **15 tur** sürer. Her turda birimler **hıza** göre sırayla hareket eder.
  15 tur sonunda iki taraf da ayaktaysa savunan taraf kazanır.
- **Enerji:** Her kahraman savaşa 50 enerjiyle başlar. Normal saldırı +50, hasar almak +10 enerji verir
  (en fazla 300). Enerji **100'e** ulaşınca sıradaki hamlede **aktif yetenek** kullanılır ve enerji sıfırlanır.
- **Durum etkileri:** Sersemletme, dondurma ve taşlaşma turu atlatır; susturma yetenek kullanımını engeller.
  Yanma, zehir ve kanama her tur sonunda hasar verir. Kontrol bağışıklığı kontrol etkilerine direnmeyi sağlar.
- **Pasifler:** Savaş başında, tur sonunda, vurulunca, saldırınca, müttefik ölünce veya kendisi ölünce
  tetiklenen pasif yetenekler savaşın gidişatını değiştirebilir.
- Savaşı ×1 / ×2 / ×4 hızda izleyebilir ya da **Atla** ile doğrudan sonuca geçebilirsin.

### Kampanya ve boşta gelir

- Her bölüm 10 aşamadır; her 10. aşama güçlü bir **bölüm sonu** savaşıdır. İlk geçişte altın, ruh özü,
  elmas ve hesap deneyimi kazanırsın; bölüm sonlarında ve her 5. aşamada parşömen de düşer.
- **Ganimet Sandığı** çevrimdışıyken bile dolar: altın, ruh özü, hesap deneyimi, temel parşömen ve
  ekipman. Gelir, geçtiğin en yüksek aşamayla artar; sandık en fazla **12 saat** biriktirir, ardından
  **Topla** ile alınmalıdır.
- Hesap seviyesi atladıkça elmas kazanırsın.

### Kahraman gelişimi

- **Seviye:** Altın ve ruh özü harcanır; maliyet seviyeyle birlikte (~seviye^1,6) artar.
- **Seviye sınırı** yıldıza bağlıdır: 1★ 20, 2★ 40, 3★ 60, 4★ 80, 5★ 100.
- **Yıldız yükseltme:** Kahraman seviye sınırındayken, aynı kahramanın aynı yıldızdaki kopyaları tüketilir:
  1★→2★ 1 kopya, 2★→3★ 2 kopya, 3★→4★ 2 kopya, 4★→5★ 3 kopya. Kilitli ve takımdaki kopyalar kullanılmaz;
  tüketilen kopyaların seviye maliyetleri iade edilir, ekipmanları depoya döner.
- **Ekipman:** Silah, Zırh, Miğfer ve Çizme yuvaları, 6 kademe. **En İyisini Kuşan** depodaki en iyi
  eşyaları takar.
- **Serbest Bırak:** İhtiyacın olmayan kahramanı bırakırsan seviye maliyetinin tamamı ve yıldızına göre
  bir ödül geri gelir. Önemli kahramanları 🔒 ile kilitle.

### Çağrı oranları

| Çağrı | Bedel | 2★ | 3★ | 4★ | 5★ |
|---|---|---|---|---|---|
| Temel | 1 Temel Parşömen | %50 | %40 | %9,5 | %0,5 |
| Kahraman | 1 Kahraman Parşömeni veya 300 💎 (10'lu: 2700 💎) | — | %55 | %41 | %4 |

- Kahraman çağrısında **50 çağrı** içinde 5★ çıkmazsa 50. çağrı kesin 5★ olur (garanti sayacı 5★ gelince sıfırlanır).
- Işık ve Karanlık grubunun 5★ kahramanları, diğer 5★'lara göre yarı olasılıkla çıkar.
- En fazla 200 kahraman taşıyabilirsin.

### Yankı Kulesi

- Her kat, aynı numaralı kampanya aşamasından daha zordur ve her zaman 6 düşman içerir.
- Her katın ilk geçişi altın, ruh özü, elmas ve deneyim verir; **her 5. kat** ek olarak 100 elmas,
  1 Kahraman Parşömeni ve 2 Temel Parşömen içeren bir bonus kattır.

## Testler

`npm test` şunları kapsar:

- **İçerik:** kimliklerin/isimlerin benzersizliği, stat aralıkları, yetenek yapısı ve açıklamalardaki sayıların
  gerçek değerlerle eşleşmesi
- **Savaş:** formüller, durum etkileri, pasif tetikleme sırası; ayrıca yüzlerce rastgele savaşta değişmezleri
  denetleyen bir fuzz testi (determinizm, can hesabı, ölülerin hareket etmemesi…)
- **Sistemler:** seviye/yıldız/ekipman akışları, çağrı oranları ve garanti, boşta gelir, kayıt dayanıklılığı
- **Denge:** gerçek savaş motoruyla 168 saatlik oyuncu simülasyonu ve ilerleme hedefleri
- **Arayüz mantığı:** biçimlendirme ve savaş oynatım modelinin motorla birebir uyumu

## Sonraki adımlar

Oyunu daha özgün kılmak için fikirler:

- **Diyar haritası:** Kampanyayı düz aşama listesi yerine Anadolu ve Orta Asya efsanelerinden esinlenen
  bölgelerle (Kaf Dağı, Ergenekon vadisi, Tepegöz'ün mağarası) dallanan bir haritaya dönüştürmek.
- **Destan zincirleri:** Aynı efsaneden gelen kahramanlar birlikte dizilince açılan ortak bonuslar ve kısa
  hikâye sahneleri.
- **Hava ve gün döngüsü:** Gece Gölge, gündüz Işık kahramanlarını güçlendiren; fırtınanın enerji kazancını
  değiştirdiği dönen savaş koşulları.
- **Obalar (loncalar):** Arkadaşlarla ortak bir oba kurup haftalık dev canavara (ör. Ak Aba Ejderi) karşı
  hasar yarışı.
- **Zanaat sistemi:** Ekipmanı demirci ocağında eritip yeniden dövme; kademe dışında rastgele “nakış”
  özellikleri ekleme.
- **Kahraman bağları:** Belirli ikililerin savaşta birbirini koruması veya birleşik yetenek kullanması.
- **Mevsimlik kule:** Her hafta farklı kurallarla (ör. yalnız Orman grubu, iyileştirme yok) sıfırlanan bir
  kule ve sıralama tablosu.
- **Kendi sanat stili:** Emoji portreler yerine CSS/SVG ile çizilmiş, gruba özgü siluet portreler.
- **Ses ve müzik:** Kopuz/bağlama tınılarıyla Web Audio tabanlı hafif efektler.
- **Günlük görevler ve başarımlar:** Oturum başına küçük hedefler ve rozetler.
