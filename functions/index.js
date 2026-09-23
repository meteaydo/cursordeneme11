const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { randomBytes, scryptSync, timingSafeEqual, randomInt } = require('crypto')

initializeApp()

const REGION = 'europe-west1'
const LOGIN_MAX_FAILS = 8
const LOGIN_LOCK_MS = 15 * 60 * 1000

function db() {
  return getFirestore()
}

function normalizeNo(value) {
  return String(value ?? '').trim()
}

function hashPin(pin) {
  const salt = randomBytes(16)
  const hash = scryptSync(String(pin), salt, 32)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

function verifyPin(pin, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false
  const [saltHex, hashHex] = stored.split(':')
  try {
    const actual = scryptSync(String(pin), Buffer.from(saltHex, 'hex'), 32)
    const expected = Buffer.from(hashHex, 'hex')
    if (actual.length !== expected.length) return false
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

function generatePin() {
  return String(randomInt(100000, 1000000))
}

function assertTeacher(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Giriş yapın.')
  }
  if (request.auth.token?.role === 'student') {
    throw new HttpsError('permission-denied', 'Bu işlem öğretmen içindir.')
  }
  return request.auth.uid
}

async function assertOwnsCourse(uid, courseId) {
  const snap = await db().doc(`courses/${courseId}`).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Ders bulunamadı.')
  const data = snap.data() || {}
  if (data.teacherId !== uid) throw new HttpsError('permission-denied', 'Bu derse erişiminiz yok.')
  return data
}

async function writePortal(courseId, studentId, courseData, studentData) {
  const okulNo = normalizeNo(studentData.no)
  const appsSnap = await db().collection(`courses/${courseId}/applications`).get()
  const apps = appsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.tarih || '').localeCompare(String(a.tarih || '')))

  const scores = []
  for (const app of apps) {
    const scoreSnap = await db().doc(`courses/${courseId}/applications/${app.id}/scores/${studentId}`).get()
    const s = scoreSnap.exists ? scoreSnap.data() : {}
    scores.push({
      appId: app.id,
      ad: app.ad || '',
      tarih: app.tarih || '',
      puan: s.puan ?? null,
      devamsiz: s.devamsiz || false,
      kisaNot: s.kisaNot || '',
    })
  }

  const logs = Array.isArray(studentData.behaviorLogs)
    ? studentData.behaviorLogs.map((log) => ({
        id: log.id,
        type: log.type,
        note: log.note,
        date: log.date,
      }))
    : []

  await db().doc(`courses/${courseId}/students/${studentId}/portal/public`).set({
    okulNo,
    adSoyad: studentData.adSoyad || '',
    dersAdi: courseData.dersAdi || '',
    sinifAdi: courseData.sinifAdi || '',
    behaviorStars: studentData.behaviorStars || { yellow: 0, purple: 0 },
    behaviorLogs: logs,
    scores,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

exports.setStudentPin = onCall({ region: REGION, cors: true }, async (request) => {
  const uid = assertTeacher(request)
  const courseId = String(request.data?.courseId || '')
  const studentId = String(request.data?.studentId || '')
  const renew = Boolean(request.data?.renew)
  const customPin = request.data?.pin != null ? String(request.data.pin).trim() : ''

  if (!courseId || !studentId) throw new HttpsError('invalid-argument', 'Ders ve öğrenci gerekli.')

  const course = await assertOwnsCourse(uid, courseId)
  const studentSnap = await db().doc(`courses/${courseId}/students/${studentId}`).get()
  if (!studentSnap.exists) throw new HttpsError('not-found', 'Öğrenci bulunamadı.')
  const student = studentSnap.data() || {}
  const okulNo = normalizeNo(student.no)
  if (!okulNo) throw new HttpsError('failed-precondition', 'Öğrenci numarası yok.')

  if (customPin && !/^\d{4,8}$/.test(customPin)) {
    throw new HttpsError('invalid-argument', 'PIN 4–8 haneli rakam olmalı.')
  }

  const loginRef = db().doc(`studentLogins/${okulNo}`)
  const loginSnap = await loginRef.get()
  const existing = loginSnap.exists ? loginSnap.data() : null

  if (existing && Array.isArray(existing.teacherIds) && existing.teacherIds.length && !existing.teacherIds.includes(uid)) {
    throw new HttpsError('already-exists', 'Bu öğrenci numarası başka bir kayıtta kullanılıyor.')
  }

  const created = !existing || !existing.pinHash
  const pin = renew || created ? customPin || generatePin() : existing.pin
  const pinHash = renew || created ? hashPin(pin) : existing.pinHash

  const link = {
    courseId,
    studentId,
    teacherId: uid,
    dersAdi: course.dersAdi || '',
    sinifAdi: course.sinifAdi || '',
  }
  const links = [link, ...((existing?.links || []).filter((l) => l.courseId !== courseId))]
  const teacherIds = Array.from(new Set([uid, ...(existing?.teacherIds || [])]))

  await loginRef.set({
    no: okulNo,
    pin,
    pinHash,
    teacherIds,
    links,
    updatedAt: FieldValue.serverTimestamp(),
  })

  const dashCourses = links.map((l) => ({
    courseId: l.courseId,
    studentId: l.studentId,
    dersAdi: l.dersAdi || '',
    sinifAdi: l.sinifAdi || '',
  }))

  await db().doc(`studentDashboards/${okulNo}`).set({
    no: okulNo,
    adSoyad: student.adSoyad || '',
    teacherIds,
    courses: dashCourses,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  await writePortal(courseId, studentId, course, student)

  if (renew) {
    try {
      await getAuth().revokeRefreshTokens(`st_${okulNo}`)
    } catch {
      /* kullanıcı henüz yok */
    }
  }

  return { pin, created: created || renew }
})

exports.getStudentPin = onCall({ region: REGION, cors: true }, async (request) => {
  const uid = assertTeacher(request)
  const courseId = String(request.data?.courseId || '')
  const studentId = String(request.data?.studentId || '')
  if (!courseId || !studentId) throw new HttpsError('invalid-argument', 'Ders ve öğrenci gerekli.')

  await assertOwnsCourse(uid, courseId)
  const studentSnap = await db().doc(`courses/${courseId}/students/${studentId}`).get()
  if (!studentSnap.exists) throw new HttpsError('not-found', 'Öğrenci bulunamadı.')
  const okulNo = normalizeNo(studentSnap.data()?.no)
  if (!okulNo) return { pin: null, hasPin: false }

  const loginSnap = await db().doc(`studentLogins/${okulNo}`).get()
  if (!loginSnap.exists) return { pin: null, hasPin: false }
  const login = loginSnap.data() || {}
  if (Array.isArray(login.teacherIds) && login.teacherIds.length && !login.teacherIds.includes(uid)) {
    throw new HttpsError('permission-denied', 'Bu öğrenci numarası başka bir kayıtta.')
  }
  return { pin: login.pin || null, hasPin: Boolean(login.pinHash) }
})

exports.studentLogin = onCall({ region: REGION, cors: true }, async (request) => {
  const no = normalizeNo(request.data?.no)
  const pin = String(request.data?.pin ?? '').trim()
  if (!no || !pin) throw new HttpsError('invalid-argument', 'Numara ve PIN gerekli.')

  const attemptRef = db().doc(`studentLoginAttempts/${no}`)
  const attemptSnap = await attemptRef.get()
  const attempt = attemptSnap.exists ? attemptSnap.data() : {}
  const lockedUntil = attempt.lockedUntil?.toMillis?.() ?? attempt.lockedUntil ?? 0
  if (lockedUntil && Date.now() < lockedUntil) {
    throw new HttpsError('resource-exhausted', 'Çok fazla deneme. Biraz sonra tekrar deneyin.')
  }

  const loginSnap = await db().doc(`studentLogins/${no}`).get()
  const login = loginSnap.exists ? loginSnap.data() : null
  const ok = login && verifyPin(pin, login.pinHash)

  if (!ok) {
    const fails = (attempt.fails || 0) + 1
    const update = { fails, lastFailAt: FieldValue.serverTimestamp() }
    if (fails >= LOGIN_MAX_FAILS) {
      update.fails = 0
      update.lockedUntil = Date.now() + LOGIN_LOCK_MS
    }
    await attemptRef.set(update, { merge: true })
    await new Promise((r) => setTimeout(r, 400))
    throw new HttpsError('invalid-argument', 'Numara veya PIN hatalı.')
  }

  await attemptRef.set({ fails: 0, lockedUntil: null }, { merge: true })

  const uid = `st_${no}`
  const token = await getAuth().createCustomToken(uid, {
    role: 'student',
    okulNo: no,
  })

  return { token }
})
