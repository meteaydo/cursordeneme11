v1.0 14.04.2026 12:25
v1.1 14.04.2026 12:38 - Onaysiz otomatik PWA guncellemeleri aktif edildi
v1.2 14.04.2026 13:34 - Zoom iyilestirildi
v1.3 14.04.2026 14:05 - Sinif ve lab duzeni kaydetme duzeltildi
v1.3.1 14.04.2026 14:10 - Sinif ve lab duzeni kaydetme duzeltildi
v1.4 14.04.2026 14:35 - Oturma plani surukleme ve coklu secim etkilesimleri optimize edildi
v1.5 14.04.2026 14:55 - öğrenci-PC arası bağlantı çizgileri eklendi ve Vercel build hataları düzeltildi
v1.6 14.04.2026 15:34 - PC numaralarının öğrencilerle birlikte hareket etmesi sağlandı
v1.7 14.04.2026 16:01 - Mobil cihazlarda klavye kapatma sorunları için dialoglar üst kısma alındı ve kaydırılabilir yapıldı
v1.8 14.04.2026 16:12 - Konsol hataları düzeltildi: COOP politikası, Firebase yetki kontrolleri eklendi ve PWA yapılandırıldı
v1.9 15.04.2026 17:15 - Oturma planı paylaşma menüsü (Excel, WhatsApp, Telegram) ve Vercel build hata düzeltmeleri (kullanılmayan değişkenlerin temizlenmesi) eklendi
v1.10 15.04.2026 18:10 - Alt navigasyon barı merkezlendi, paylaş menüsü mobil taşma sorunları ve z-index katman hataları giderildi, WhatsApp/Telegram paylaşım butonları kaldırıldı.
v1.11 15.04.2026 19:16 - Alt navigasyon barı tüm sayfalarda merkezlendi, ayarlar menüsü görünürlük (z-index ve overflow) sorunları kökten çözüldü, katman hiyerarşisi maksimize edildi.
v1.12 15.04.2026 19:55 - Ders kartı tasarımı sadeleştirildi (ders adı ve sınıf adı birleştirildi), tarih ve saat alanları kaldırıldı, kod temizliği yapıldı.
v1.13 17.04.2026 22:16 - Cloudflare R2 üzerinden otomatik sınıf şablonu (fotoğraflı excel) yükleme özelliği ve seçilebilir sınıf listesi menüsü eklendi.

v1.14 19.04.2026 17:40 - Dialog, Spotlight ve açılır menülerin Header çubuğunun arkasında kalma sorunu z-index hiyerarşisi (z-[500+]) yeniden düzenlenerek kökten çözüldü. Mobil cihazlarda Header'da uzun ders isimlerinin sığmama sorunu çözülerek başlığa maksimum genişlik verildi. Geri butonundaki sayfa yönlendirme metni çift satırlı tasarımla ikon altına alınarak ekrana kazandırıldı. Uygulama kartlarının (etiketler) düzensiz uzaması engellenerek sabit genişliğe ve "seçili olanda %25 uzama + en sola akıllı kaydırma" özelliklerine kavuşturuldu. Uygulamalara özel 'Kapak Fotoğrafı' altyapısı (Firestore ve Storage) kurularak, Öğrenci listesindeki karta basılı tutunca açılan "Uygulamayı Düzenle" paneline entegre edildi (Kameradan çekim ve Galeriden yükleme desteğiyle birlikte). Vercel build güvenliği sağlandı.

v1.15.2 20.04.2026 - Oturma planı sayfasında otomatik kaydetme özelliği devre dışı bırakıldı, görünür ve menü dışına çıkarılmış 'Kaydet' butonu eklendi. Sayfadan ayrılırken veya sekmeyi kapatırken kaydedilmemiş değişiklikler için onaya dayalı uyarı mekanizması entegre edildi.

v1.15.3 20.04.2026 - Sistem genelindeki tarayıcı uyarıları modern dialog (ConfirmDialog) ile değiştirildi.

v1.16 20.04.2026 - Öğrenci PC numarası çakışma yönetimi ve doğrulama sistemi eklendi. Profil sayfası ve oturma planı üzerinde mükerrer atamaları engelleyen akıllı onay dialogu (ConfirmDialog) entegre edildi. PC no devir/takas işlemleri kontrollü hale getirildi.

v1.17 20.04.2026 - PC no etiketleri oturma planında sürüklenemeyen, öğrenci kartına yapışık yapıya dönüştürüldü. Tüm pc_label drag/snap/atama mantığı, AssignmentConfirmModal, pcSwapConfirm, SVG bağlantı çizgileri ve ilgili boştaki değişkenler temizlendi. PC no değişikliği artık sadece öğrenci profili sayfasından yapılabiliyor.

v1.18 20.04.2026 - PC no etiketleri öğrenci kartlarının sol üst köşesine saat yönünde 45 derece döndürülerek yerleştirildi. Etiket yüksekliği daraltıldı ve metin sola yaslanarak daha kompakt bir görünüm sağlandı.

v1.19 20.04.2026 - Öğrenci kartlarına dikey öğrenci numarası eklendi. Numara yazı stili (boyut ve renk) karttaki ad-soyad etiketiyle senkronize edildi (9px, Bold, Slate-800). Kartın sağ kenarında, arkaplansız ve -90 derece döndürülmüş şekilde konumlandırıldı.

v1.19.1 20.04.2026 - PC numarası çakışması (takas/devir) durumunda oluşan senkronizasyon hatası düzeltildi. Bir öğrenciye başka bir öğrencinin PC numarası atandığında, eski sahibinin verisi artık otomatik olarak temizleniyor. Aynı zamanda oturma planı sayfasındaki PC no etiketlerine de boş (temizlenmiş) durum anında yansıyor.

v1.20 20.04.2026 - Oturma planı sayfasında, öğrenci kartına tıklanarak açılan "Büyük Kart" üzerinde "PC No" yönetimi paneli eklendi.

v1.21 20.04.2026 - Oturma planı sayfasında "Boş Sıra"lar için tam PC yönetimi desteği getirildi. Boş sıralar artık kendi PC etiketleriyle (pc_label) eşleşebiliyor, tıklandığında büyüyerek numara değişikliğine izin veriyor ve beraberinde sürükleniyor. Yeni boş sıra eklendiğinde etiketiyle birlikte oluşması sağlandı ve tek tıkla silinmeleri için sağ üst köşelerine çöp kutusu ikonu eklendi.

v1.22 20.04.2026 - Bulut tabanlı "Oturma Planı Paylaşım Sistemi" hayata geçirildi. Farklı öğretmenlerin paylaştığı planları "Öğrenci No" bazlı akıllı eşleştirme ile indirme ve kendi kursuna uygulama özelliği eklendi. Ayarlar menüsü Paylaşım Toggle ve "Paylaşılandan İndir" (ikili satır tasarımı ve Download ikonuyla) butonlarıyla güncellendi. Kullanılmayan değişkenler ve build hataları temizlendi.