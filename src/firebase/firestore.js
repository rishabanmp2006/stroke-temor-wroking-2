import {
    collection, doc, setDoc, getDoc, getDocs,
    query, where, orderBy, limit, serverTimestamp, addDoc
} from 'firebase/firestore'
import { db } from './config'

/* ──────────────────────────────────────────────
   USER / ROLE MANAGEMENT
────────────────────────────────────────────── */
export async function createUserProfile(uid, data) {
    await setDoc(doc(db, 'users', uid), {
        ...data,
        createdAt: serverTimestamp(),
    }, { merge: true })
}

export async function getUserProfile(uid) {
    const snap = await getDoc(doc(db, 'users', uid))
    return snap.exists() ? snap.data() : null
}

/* ──────────────────────────────────────────────
   SESSION MANAGEMENT
────────────────────────────────────────────── */
export async function saveSession(patientId, sessionData) {
    const recordsRef = collection(db, 'sessions', patientId, 'records')
    const ref = await addDoc(recordsRef, {
        ...sessionData,
        createdAt: serverTimestamp(),
    })
    return ref.id
}

export async function getPatientSessions(patientId, limitCount = 10) {
    const q = query(
        collection(db, 'sessions', patientId, 'records'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
    )
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
