export interface SeatObject {
  id: string;
  type: 'student' | 'empty_desk' | 'empty_object' | 'tahta' | 'masa' | 'pc_label';
  studentId?: string;        // Sadece 'student' tipi için
  pcNo?: string;             // Sadece 'pc_label' tipi için
  linkedStudentId?: string;  // pc_label'ın ait olduğu öğrenci (canonical bağlantı)
  x: number;
  y: number;
}

export interface Course {
  id: string
  teacherId: string
  dersAdi: string
  sinifAdi: string
  sinifMevcudu: number
  createdAt: Date
  seatingPlan?: string; // JSON.stringify(SeatObject[]) şeklinde tutulacak
  hasPendingWrites?: boolean
}

export interface BehaviorLog {
  id: string
  type: 'yellow' | 'purple'
  note: string
  photoUrl?: string
  photoUrls?: string[]
  date: string
}

export interface Student {
  id: string
  courseId: string
  foto?: string
  no: string
  adSoyad: string
  pcNo: string
  eskiPcNolari: string[]
  ozelDurumNotlari: string
  ozelDurumFotolari?: string[]
  bep?: boolean
  bepNotu?: string
  bepPlaniYapildi?: boolean
  behaviorStars?: { yellow: number; purple: number }
  behaviorLogs?: BehaviorLog[]
  createdAt: Date
}

export interface Application {
  id: string
  courseId: string
  ad: string
  tarih: string
  createdAt: Date
}

export interface Score {
  id: string
  applicationId: string
  studentId: string
  puan: number | null
  kameraFoto?: string
  devamsiz?: boolean
  kisaNot?: string
}

export interface CourseFormData {
  dersAdi: string
  sinifAdi: string
  sinifMevcudu: number
}

export interface StudentFormData {
  no: string
  adSoyad: string
  pcNo: string
  eskiPcNolari: string[]
  ozelDurumNotlari: string
  ozelDurumFotolari?: string[]
  bep?: boolean
  bepNotu?: string
  bepPlaniYapildi?: boolean
  foto?: string
  behaviorStars?: { yellow: number; purple: number }
  behaviorLogs?: BehaviorLog[]
}
