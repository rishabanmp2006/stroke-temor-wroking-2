import { useState, useRef, useCallback } from 'react'
import { saveSession } from '../firebase/firestore'
import { useAuth } from '../contexts/AuthContext'

export default function useSession() {
    const { currentUser } = useAuth()
    const [sessionActive, setSessionActive] = useState(false)
    const [sessionId, setSessionId] = useState(null)
    const [sessionSummary, setSessionSummary] = useState(null)
    const sessionRef = useRef({
        startTime: null,
        tremorScores: [],
        maxTilt: 0,
        peakTremor: 0,
        alertCount: 0,
        drinkAttempts: 0,
        drinkSuccess: 0,
        drinkUnstable: 0,
    })

    const startSession = useCallback(() => {
        sessionRef.current = {
            startTime: Date.now(),
            tremorScores: [],
            maxTilt: 0,
            peakTremor: 0,
            alertCount: 0,
            drinkAttempts: 0,
            drinkSuccess: 0,
            drinkUnstable: 0,
        }
        setSessionSummary(null)
        setSessionActive(true)
    }, [])

    // Track previous drink count to detect new completions
    const prevDrinkSuccessRef = useRef(0)
    const prevDrinkUnstableRef = useRef(0)
    const wasUnstableDrinkingRef = useRef(false)

    const recordMetrics = useCallback((metrics) => {
        if (!sessionActive) return
        const s = sessionRef.current

        if (metrics.tremorScore !== undefined) {
            s.tremorScores.push(metrics.tremorScore)
            s.peakTremor = Math.max(s.peakTremor, metrics.tremorScore)
        }

        // FIX Bug 2: tilt.alertLevel is now correctly populated from useCameraAI
        if (metrics.tilt?.angle > s.maxTilt) s.maxTilt = metrics.tilt.angle
        if (metrics.tilt?.alertLevel === 'critical') s.alertCount++

        // Track drink completions (drinkSuccessCount increments when drink ends)
        if (metrics.drinkSuccessCount > prevDrinkSuccessRef.current) {
            const newDrinks = metrics.drinkSuccessCount - prevDrinkSuccessRef.current
            s.drinkSuccess += newDrinks
            s.drinkAttempts += newDrinks
            prevDrinkSuccessRef.current = metrics.drinkSuccessCount
        }

        // FIX Bug 4: count unstable drinking bouts (rising edge on isUnstableDrink)
        if (metrics.isUnstableDrink && !wasUnstableDrinkingRef.current) {
            s.drinkUnstable++
        }
        wasUnstableDrinkingRef.current = !!metrics.isUnstableDrink

    }, [sessionActive])

    const endSession = useCallback(async () => {
        if (!sessionActive) return
        setSessionActive(false)

        const s = sessionRef.current
        const durationMs = Date.now() - s.startTime

        // FIX Bug 3: compute AND save avgTremorScore (PatientHistory reads this field)
        const avgTremorScore = s.tremorScores.length > 0
            ? Math.round(s.tremorScores.reduce((a, b) => a + b, 0) / s.tremorScores.length)
            : 0

        const summary = {
            patientId: currentUser?.uid || 'demo',
            patientName: currentUser?.displayName || 'Demo Patient',
            timestamp: new Date().toISOString(),
            duration: Math.round(durationMs / 1000),
            avgTremorScore,                              // FIX: was missing
            peakTremorScore: s.peakTremor,
            stabilityScore: Math.max(0, 100 - avgTremorScore),
            maxTiltAngle: Math.round(s.maxTilt),
            alertCount: s.alertCount,
            drinkAttempts: s.drinkAttempts,
            drinkSuccessCount: s.drinkSuccess,
            drinkUnstableCount: s.drinkUnstable,         // FIX: was always 0
            drinkSuccessRate: s.drinkAttempts > 0
                ? Math.round((s.drinkSuccess / s.drinkAttempts) * 100)
                : 0,
        }

        // Reset refs for next session
        prevDrinkSuccessRef.current = 0
        prevDrinkUnstableRef.current = 0
        wasUnstableDrinkingRef.current = false

        setSessionSummary(summary)

        try {
            const currentPatientId = currentUser?.uid || 'demo'
            const id = await saveSession(currentPatientId, summary)
            setSessionId(id)
        } catch (err) {
            console.warn('Could not save session to Firestore (demo mode):', err.message)
        }

        return summary
    }, [sessionActive, currentUser])

    return {
        sessionActive,
        sessionId,
        sessionSummary,
        startSession,
        endSession,
        recordMetrics,
    }
}
