/**
 * TremorEngine – Rolling 3-second window tremor severity analyzer
 */
import {
    calcWristDisplacementVariance,
    estimateOscillationFreq,
} from './angleCalculator'

const WINDOW_SECONDS = 3
const WINDOW_DURATION_MS = WINDOW_SECONDS * 1000

export class TremorEngine {
    constructor() {
        this.positionHistory = []   // [{x, y, ts}]
        this.displacements = []     // scalar distances
        this.currentScore = 0
    }

    update(wristLandmark) {
        if (!wristLandmark) return this.currentScore

        const now = Date.now()
        const pos = { x: wristLandmark.x, y: wristLandmark.y, ts: now }
        this.positionHistory.push(pos)

        const cutoff = now - WINDOW_DURATION_MS
        while (this.positionHistory.length > 0 && this.positionHistory[0].ts < cutoff) {
            this.positionHistory.shift()
        }

        if (this.positionHistory.length >= 2) {
            const prev = this.positionHistory[this.positionHistory.length - 2]
            const dx = pos.x - prev.x
            const dy = pos.y - prev.y
            this.displacements.push({ d: Math.sqrt(dx * dx + dy * dy), ts: now })
        }

        while (this.displacements.length > 0 && this.displacements[0].ts < cutoff) {
            this.displacements.shift()
        }

        this.currentScore = this._computeScore()
        return this.currentScore
    }

    _computeScore() {
        if (this.positionHistory.length < 10) return 0

        // Variance component (0–50 points)
        const displacementVar = calcWristDisplacementVariance(this.positionHistory)
        const varScore = Math.min(50, displacementVar * 5000)

        // Oscillation frequency component (0–50 points)
        const dVals = this.displacements.map(d => d.d)
        const freq = estimateOscillationFreq(dVals, WINDOW_SECONDS)
        // Pathological tremor typically 3–12 Hz
        const freqScore = Math.min(50, freq * 6)

        return Math.round(varScore + freqScore)
    }

    getScore() { return Math.min(100, this.currentScore) }

    getSeverity() {
        const s = this.getScore()
        if (s <= 20) return { label: 'Stable', className: 'severity-stable', level: 0 }
        if (s <= 50) return { label: 'Mild', className: 'severity-mild', level: 1 }
        if (s <= 75) return { label: 'Moderate', className: 'severity-moderate', level: 2 }
        return { label: 'Severe', className: 'severity-severe', level: 3 }
    }

    getOscillationFreq() {
        const dVals = this.displacements.map(d => d.d)
        return estimateOscillationFreq(dVals, WINDOW_SECONDS).toFixed(1)
    }

    getStabilityScore() {
        return Math.max(0, 100 - this.getScore())
    }

    reset() {
        this.positionHistory = []
        this.displacements = []
        this.currentScore = 0
    }
}
