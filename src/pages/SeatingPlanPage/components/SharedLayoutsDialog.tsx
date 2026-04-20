import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Download, User, CalendarDays, LayoutPanelTop } from 'lucide-react'
import type { SharedSeatingPlan } from '@/types'

interface SharedLayoutsDialogProps {
  open: boolean
  onClose: () => void
  sharedPlans: SharedSeatingPlan[]
  loading: boolean
  currentCourseId: string
  onLoadPlan: (plan: SharedSeatingPlan) => void
}

/** Paylaşılmış düzenlerin listelendiği ve seçilerek yüklenebildiği dialog */
export function SharedLayoutsDialog({
  open,
  onClose,
  sharedPlans,
  loading,
  currentCourseId,
  onLoadPlan,
}: SharedLayoutsDialogProps) {
  const [confirmPlanId, setConfirmPlanId] = useState<string | null>(null)

  if (!open) return null

  const handleLoad = (plan: SharedSeatingPlan) => {
    onLoadPlan(plan)
    setConfirmPlanId(null)
    onClose()
  }

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  // Mevcut kursun kendi paylaşımını listeden hariç tut
  const visiblePlans = sharedPlans.filter(p => p.courseId !== currentCourseId)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={() => { setConfirmPlanId(null); onClose() }}
      />

      {/* Dialog */}
      <div className="fixed inset-x-4 top-[10%] md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[480px] md:max-h-[70vh] z-[301] flex flex-col bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden animate-in zoom-in-95 fade-in duration-300">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-violet-200">
              <LayoutPanelTop className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-slate-800 tracking-tight">Paylaşılmış Düzenler</h2>
              <p className="text-[11px] text-slate-400 font-medium">Aynı sınıf için paylaşılan oturma planları</p>
            </div>
          </div>
          <button
            onClick={() => { setConfirmPlanId(null); onClose() }}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-[200px] max-h-[55vh]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-violet-500" />
              <span className="text-[12px] text-slate-400 font-medium">Yükleniyor...</span>
            </div>
          ) : visiblePlans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                <LayoutPanelTop className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-[13px] text-slate-400 font-medium text-center">
                Bu sınıf için paylaşılmış düzen bulunamadı.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {visiblePlans.map((plan) => (
                <div
                  key={plan.id}
                  className="group relative bg-gradient-to-br from-slate-50 to-white border border-slate-150 rounded-2xl p-4 hover:border-violet-200 hover:shadow-md hover:shadow-violet-100/50 transition-all duration-200"
                >
                  {/* Kart bilgileri */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Ders Adı */}
                      <h3 className="text-[14px] font-bold text-slate-800 truncate">
                        {plan.dersAdi}
                      </h3>

                      {/* Öğretmen */}
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <User className="w-3 h-3 text-violet-400 shrink-0" />
                        <span className="text-[11px] text-slate-500 font-medium truncate">
                          {plan.teacherName}
                        </span>
                      </div>

                      {/* Alt bilgi satırı */}
                      <div className="flex items-center gap-3 mt-2">
                        {/* Düzen modu */}
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                          {plan.layoutMode === 'classroom' ? '🏫 Sınıf' : '🖥️ Lab'}
                        </span>

                        {/* Öğrenci sayısı */}
                        <span className="text-[10px] text-slate-400 font-medium">
                          {plan.studentCount} öğrenci
                        </span>

                        {/* Tarih */}
                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                          <CalendarDays className="w-3 h-3" />
                          <span>{formatDate(plan.updatedAt)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Yükle butonu */}
                    {confirmPlanId === plan.id ? (
                      <div className="flex flex-col items-end gap-1.5 shrink-0 animate-in fade-in zoom-in-95 duration-200">
                        <span className="text-[10px] text-amber-600 font-bold">Mevcut plan değişecek!</span>
                        <div className="flex gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmPlanId(null)}
                            className="h-7 px-2.5 text-[10px] font-bold rounded-lg"
                          >
                            İptal
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleLoad(plan)}
                            className="h-7 px-3 text-[10px] font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-200"
                          >
                            Onayla
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmPlanId(plan.id)}
                        className="h-8 px-3 text-[10px] font-bold uppercase tracking-wider rounded-xl text-violet-600 hover:bg-violet-50 hover:text-violet-700 transition-all shrink-0 opacity-80 group-hover:opacity-100"
                      >
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        Yükle
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 shrink-0">
          <p className="text-[10px] text-slate-400 text-center">
            Yüklenen düzen mevcut oturma planınızın yerini alacaktır.
          </p>
        </div>
      </div>
    </>
  )
}
