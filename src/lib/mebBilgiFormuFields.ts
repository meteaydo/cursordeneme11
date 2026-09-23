import type { MebOgrenciBilgiFormu } from '@/types'

export const MEB_FOOTER = `KULLANIM AMACI: Öğrencinin ailesi ve kendisi hakkındaki temel bilgileri almak ve varsa hangi risk grubunda olduğunu belirlemek amacıyla kullanılır.
KİMLER KULLANIR? Sınıf rehber öğretmenleri tarafından kullanılır.
DİKKAT EDİLECEK HUSUSLAR?
1. Sınıf rehber öğretmeni, Öğrenci Bilgi Formundaki bilgilere göre öğrencinin e-okul bilgilerini günceller.
2. Öğrencinin risk altında olduğu belirlenirse önleyici ve koruyucu çalışmalar yapılır.
3. Her eğitim öğretim yılı başında güncellenir.
4. Her bir “Öğrenci Bilgi Formu”nun muhafazasında gizliliğe dikkat edilir ve bu konuda sınıf rehber öğretmeni bilgilendirilir.
5. Öğrenci bilgi formu, okul ve sınıf risk haritasının oluşturulmasında veri sağlar.
6. Bir örneği sınıf rehber öğretmeninde olacak şekilde rehberlik servisinde her öğrencinin kişisel dosyasında saklanır.`

export type MebFieldDef = {
  key: keyof MebOgrenciBilgiFormu
  label: string
  multiline?: boolean
}

export const MEB_STUDENT_FIELDS: MebFieldDef[] = [
  { key: 'dogumYeriTarihi', label: 'Doğum yeri ve tarihi' },
  { key: 'okulOncesiEgitim', label: 'Okul öncesi eğitim aldınız mı?' },
  { key: 'surekliHastalik', label: 'Sürekli bir hastalık var mı?' },
  { key: 'ilacVeyaCihaz', label: 'Sürekli kullandığınız ilaç veya tıbbi cihaz' },
  { key: 'hoslandigi', label: 'Ne yapmaktan hoşlanırsınız?', multiline: true },
  { key: 'dersDisiFaaliyet', label: 'Ders dışı faaliyetleriniz nelerdir? Bir işte çalışıyor musunuz?', multiline: true },
  { key: 'okulEvDegisikligi', label: 'Yakın zamanda okul ya da ev değişikliği yaptınız mı?' },
  { key: 'bilgisayarKullanim', label: 'Kendinize ait bilgisayarınız var mı? Varsa günde ortalama kaç saat kullanırsınız?' },
  { key: 'telefonKullanim', label: 'Kendinize ait cep telefonu var mı? Varsa günde ortalama kaç saat kullanırsınız?' },
  { key: 'etkiOlay', label: 'Etkisi altında kaldığınız bir olay yaşadıysanız açıklayınız', multiline: true },
]

export const MEB_PARENT_FIELDS: MebFieldDef[] = [
  { key: 'veliAdSoyad', label: 'Adı soyadı' },
  { key: 'veliYakinlik', label: 'Yakınlığı' },
  { key: 'veliTelefon', label: 'Telefon numarası' },
  { key: 'veliEgitim', label: 'Eğitim durumu' },
  { key: 'veliMeslek', label: 'Mesleği' },
]

export const MEB_FAMILY_FIELDS: MebFieldDef[] = [
  { key: 'kacKardes', label: 'Kaç kardeşsiniz?' },
  { key: 'kacinciCocuk', label: 'Kaçıncı çocuksunuz?' },
  { key: 'okulaGidenKardes', label: 'Okula giden kardeş sayısı' },
  { key: 'aileHastalikEngel', label: 'Aile üyelerinden sürekli hastalığı/engeli olan biri var mı?' },
  { key: 'evdeKimlerYasiyor', label: 'Evinizde sizinle birlikte kimler yaşıyor?', multiline: true },
]

export const MEB_FORM_SECTIONS: { title: string; fields: MebFieldDef[] }[] = [
  { title: 'Öğrenci bilgileri', fields: MEB_STUDENT_FIELDS },
  { title: 'Veli bilgileri', fields: MEB_PARENT_FIELDS },
  { title: 'Aile bilgisi', fields: MEB_FAMILY_FIELDS },
]

export type MebLayoutCell = { label: string; value: string }
export type MebLayoutRow =
  | { kind: 'section'; title: string }
  | { kind: 'pair'; left: MebLayoutCell; right?: MebLayoutCell; full?: boolean }

function cell(field: MebFieldDef, data: MebOgrenciBilgiFormu): MebLayoutCell {
  return { label: field.label, value: data[field.key]?.trim() ?? '' }
}

export function buildMebFormLayout(data: MebOgrenciBilgiFormu = {}): MebLayoutRow[] {
  const rows: MebLayoutRow[] = []
  for (const section of MEB_FORM_SECTIONS) {
    rows.push({ kind: 'section', title: section.title.toLocaleUpperCase('tr-TR') })
    const queue: MebFieldDef[] = []
    const flush = (field: MebFieldDef, full = false) => {
      rows.push({ kind: 'pair', left: cell(field, data), full })
    }
    for (const field of section.fields) {
      if (field.multiline) {
        if (queue.length) flush(queue.shift()!)
        flush(field, true)
        continue
      }
      queue.push(field)
      if (queue.length === 2) {
        rows.push({ kind: 'pair', left: cell(queue.shift()!, data), right: cell(queue.shift()!, data) })
      }
    }
    if (queue.length) flush(queue.shift()!)
  }
  return rows
}
