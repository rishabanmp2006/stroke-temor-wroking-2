import { useRef, useEffect, useCallback, useState } from 'react'
import { initMediaPipe } from '../ai/mediapipeInit'
import { AIEngine } from '../ai/engine'
import { TiltMonitor } from '../ai/tiltIntelligence'

// Tilt alert thresholds (must match engine.js)
const TILT_SOFT_THRESHOLD = 30
const TILT_CRITICAL_THRESHOLD = 60

const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17],
]

const POSE_CONNECTIONS = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 23], [12, 24], [23, 24], [23, 25], [24, 26],
    [25, 27], [26, 28],
]

function drawLandmarks(ctx, landmarks, color, radius = 4) {
    ctx.fillStyle = color
    for (const lm of landmarks) {
        ctx.beginPath()
        ctx.arc(lm.x * ctx.canvas.width, lm.y * ctx.canvas.height, radius, 0, 2 * Math.PI)
        ctx.fill()
    }
}

function drawConnections(ctx, landmarks, connections, color, lineWidth = 2) {
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    for (const [i, j] of connections) {
        if (!landmarks[i] || !landmarks[j]) continue
        ctx.beginPath()
        ctx.moveTo(landmarks[i].x * ctx.canvas.width, landmarks[i].y * ctx.canvas.height)
        ctx.lineTo(landmarks[j].x * ctx.canvas.width, landmarks[j].y * ctx.canvas.height)
        ctx.stroke()
    }
}

/**
 * Derive tilt alert level from a tilt angle (degrees relative to baseline).
 * Returns 'none' | 'warning' | 'critical'
 */
function getTiltAlertLevel(tiltDeg) {
    if (tiltDeg >= TILT_CRITICAL_THRESHOLD) return 'critical'
    if (tiltDeg >= TILT_SOFT_THRESHOLD) return 'warning'
    return 'none'
}

export default function useCameraAI({ videoRef, canvasRef, onMetrics, active }) {
    const animRef = useRef(null)
    const lastVideoTime = useRef(-1)
    const mpRef = useRef(null)
    const [aiReady, setAiReady] = useState(false)
    const [loadingMessage, setLoadingMessage] = useState('Loading AI models...')

    // FIX Bug 1: instances live inside the hook via useRef, not module-level singletons.
    // This prevents state bleeding across mounts, hot-reload duplicates, and StrictMode issues.
    const aiEngineRef = useRef(null)
    const tiltMonitorRef = useRef(null)
    if (!aiEngineRef.current) aiEngineRef.current = new AIEngine()
    if (!tiltMonitorRef.current) tiltMonitorRef.current = new TiltMonitor()

    const stopLoop = useCallback(() => {
        if (animRef.current) {
            cancelAnimationFrame(animRef.current)
            animRef.current = null
        }
    }, [])

    const startLoop = useCallback(async () => {
        if (!mpRef.current) {
            try {
                setAiReady(false)
                mpRef.current = await initMediaPipe((msg) => setLoadingMessage(msg))
                setAiReady(true)
            } catch (err) {
                console.error('MediaPipe init failed:', err)
                setLoadingMessage('Failed to load AI models. Check console & reload.')
                return
            }
        }

        const { handLandmarker, poseLandmarker } = mpRef.current
        const aiEngine = aiEngineRef.current
        const tiltMonitor = tiltMonitorRef.current

        function detect() {
            const video = videoRef.current
            const canvas = canvasRef.current
            if (!video || !canvas || video.readyState < 2) {
                animRef.current = requestAnimationFrame(detect)
                return
            }

            const now = performance.now()
            if (video.currentTime === lastVideoTime.current) {
                animRef.current = requestAnimationFrame(detect)
                return
            }
            lastVideoTime.current = video.currentTime

            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            const ctx = canvas.getContext('2d')
            ctx.clearRect(0, 0, canvas.width, canvas.height)

            let handResults = null
            let poseResults = null
            try {
                handResults = handLandmarker.detectForVideo(video, now)
                poseResults = poseLandmarker.detectForVideo(video, now)
            } catch (_e) { /* detection error - skip frame */ }

            const handLandmarks = handResults?.landmarks?.[0] || null
            const poseLandmarks = poseResults?.landmarks?.[0] || null
            const poseWorldLandmarks = poseResults?.worldLandmarks?.[0] || null

            // Draw pose skeleton
            if (poseLandmarks) {
                drawConnections(ctx, poseLandmarks, POSE_CONNECTIONS, 'rgba(14,94,79,0.8)', 2)
                drawLandmarks(ctx, poseLandmarks, 'rgba(18,120,95,0.9)', 3)
            }

            // Draw hand skeleton
            if (handLandmarks) {
                drawConnections(ctx, handLandmarks, HAND_CONNECTIONS, 'rgba(200,169,81,0.9)', 2)
                drawLandmarks(ctx, handLandmarks, '#C8A951', 5)
            }

            // Tilt calculation
            const tiltResult = tiltMonitor.update(handLandmarks, false)
            const rawTiltDegree = Math.abs(tiltResult.angle - tiltResult.baseline)

            // FIX Bug 2: compute alertLevel here so camera border and session alertCount work
            const alertLevel = getTiltAlertLevel(rawTiltDegree)
            const tiltWithAlert = {
                angle: Math.round(rawTiltDegree),
                baseline: Math.round(tiltResult.baseline),
                alertLevel,
            }

            // AI engine - unified 4-param call
            const engineOutput = aiEngine.processFrame(
                poseLandmarks,
                poseWorldLandmarks,
                handLandmarks,
                rawTiltDegree
            )

            // Severity label from tremor score
            const tremorScore = Math.min(100, engineOutput.tremorLevel)
            const severityLabel = tremorScore > 60 ? 'Severe'
                : tremorScore > 30 ? 'Moderate'
                    : tremorScore > 15 ? 'Mild'
                        : 'Stable'

            onMetrics?.({
                tremorScore,
                stabilityScore: engineOutput.stabilityScore,
                severity: { label: severityLabel, className: `severity-${severityLabel.toLowerCase()}` },
                oscillationFreq: aiEngine.tremorEngine?.getOscillationFreq() || '0.0',
                tilt: tiltWithAlert,
                activity: engineOutput.activity,
                confidence: engineOutput.confidence,
                bodyDetected: engineOutput.bodyDetected,
                aiReady: true,
                drinkEvent: null,
                drinkSuccessCount: engineOutput.drinkSuccessCount,
                postureDurationMs: engineOutput.postureDurationMs || 0,
                fallRisk: engineOutput.fallRisk || 'low',
                // FIX Bug 4: flag unstable drinks (high tremor while drinking)
                isUnstableDrink: engineOutput.activity === 'Drinking' && tremorScore > 40,
                unsafeWarning: null,
                debug: engineOutput.debug,
            })

            animRef.current = requestAnimationFrame(detect)
        }

        animRef.current = requestAnimationFrame(detect)
    }, [videoRef, canvasRef, onMetrics])

    useEffect(() => {
        if (active) {
            startLoop()
        } else {
            stopLoop()
            // FIX Bug 1: reset the per-hook instances
            aiEngineRef.current?.reset()
            tiltMonitorRef.current?.reset()
        }
        return stopLoop
    }, [active, startLoop, stopLoop])

    const calibrateTilt = useCallback(() => tiltMonitorRef.current?.calibrate(), [])

    return { stopLoop, startLoop, calibrateTilt, aiReady, loadingMessage }
}
