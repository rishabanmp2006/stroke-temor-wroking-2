/**
 * TiltMonitor – Pure mathematics class for calculating and smoothing 
 * relative wrist offset for graphing purposes.
 * Speech logic relocated to AI Engine.
 */
import { calcWristAngle } from './angleCalculator'

export class TiltMonitor {
    constructor() {
        this.currentAngle = 0
        this.baselineAngle = 0
        this.angleBuffer = []
    }

    calibrate() {
        this.baselineAngle = this.currentAngle
    }

    update(handLandmarks) {
        if (!handLandmarks || handLandmarks.length === 0) {
            return { angle: 0, baseline: this.baselineAngle }
        }

        const rawAngle = calcWristAngle(handLandmarks)
        this.angleBuffer.push(rawAngle)
        if (this.angleBuffer.length > 10) this.angleBuffer.shift()

        const smoothedAngle = this.angleBuffer.reduce((a, b) => a + b, 0) / this.angleBuffer.length
        this.currentAngle = smoothedAngle

        return {
            angle: Math.round(this.currentAngle),
            baseline: Math.round(this.baselineAngle)
        }
    }

    getAngle() { return this.currentAngle }
    getBaseline() { return this.baselineAngle }

    reset() {
        this.currentAngle = 0;
        this.baselineAngle = 0;
        this.angleBuffer = [];
    }
}
