import {
    angleBetweenPoints,
    isHoldingObject,
} from './angleCalculator';
import { TremorEngine } from './tremorEngine';

// ─── Tilt thresholds ────────────────────────────────────────────────────────
const SOFT_THRESHOLD     = 30;
const CRITICAL_THRESHOLD = 60;
const RESET_THRESHOLD    = 20;

// ─── Posture ─────────────────────────────────────────────────────────────────
// Standing: knee angle > this (straight legs). 160 is more forgiving than 165.
const STANDING_KNEE_MIN   = 160;
// Sitting: knee angle within this band (bent, ~90° ± buffer)
const SITTING_KNEE_MIN    = 55;
const SITTING_KNEE_MAX    = 130;
// Shoulder-to-hip horizontal alignment tolerance (normalised units).
// Removed entirely for standing — webcam crops often hide hips, making this
// check unreliable. We rely only on knee angles + hip-above-knee geometry.
// For a seated check we use a separate hip-height heuristic instead.

// ─── Drinking ────────────────────────────────────────────────────────────────
// How close (normalised) the wrist must be to the nose to count as "near mouth"
const DRINK_WRIST_NOSE_CLOSE  = 0.28;   // was 0.15 — too strict, missed real lifts
const DRINK_WRIST_NOSE_GATE   = 0.40;   // reset zone (hand clearly away)
const DRINK_ELBOW_MIN         = 35;     // was 45 — allow more natural arm angles
const DRINK_ELBOW_MAX         = 145;    // was 125 — allow arm extended slightly past 90°
const DRINK_HOLD_MS           = 600;    // ms wrist must stay near mouth (was 800)

// ─── Timing ──────────────────────────────────────────────────────────────────
const STANDING_CONFIRM_MS = 1200;   // ms before standing is confirmed (was 1500)
const SITTING_COUNTER_MAX = 20;     // frames of sitting evidence before confirming

export class AIEngine {
    constructor() {
        this.tremorEngine = new TremorEngine();

        // Tilt state
        this.softActive     = false;
        this.criticalActive = false;
        this.synth          = window.speechSynthesis || null;

        // Voice debounce
        this.lastSpokenMessage = '';
        this.lastSpokenTime    = 0;

        // Activity
        this.currentState  = 'Idle';

        // Smoothed counters — increment toward SITTING_COUNTER_MAX, decay when not detected
        this.sittingCounter  = 0;

        // Boolean standing state (time-gated)
        this.isActuallyStanding  = false;
        this.standingStartTime   = 0;

        // Boolean drinking state (time-gated)
        this.isActuallyDrinking  = false;
        this.drinkingStartTime   = 0;

        // Drink completion tracking
        this.wasDrinking      = false;
        this.drinkSuccessCount = 0;

        // Tilt warning timing
        this.tiltWarningStartTime = 0;

        // For wrist-velocity check
        this.lastWristY = 0;
    }

    // ─── Voice ───────────────────────────────────────────────────────────────
    _speak(message) {
        if (!this.synth) return;
        const now = Date.now();
        if (this.lastSpokenMessage === message && (now - this.lastSpokenTime) < 5000) return;
        this.lastSpokenMessage = message;
        this.lastSpokenTime    = now;
        this.synth.cancel();
        const u = new SpeechSynthesisUtterance(message);
        u.rate = 0.9; u.pitch = 1.0; u.volume = 1.0;
        this.synth.speak(u);
    }

    /**
     * Main per-frame entry point.
     * @param {Array}  poseLandmarks      – 2D normalised landmarks [0..32]
     * @param {Array}  poseWorldLandmarks – 3D world landmarks [0..32]
     * @param {Array|null} handLandmarks  – 21-point hand array or null
     * @param {number} tilt               – smoothed absolute tilt degrees
     */
    processFrame(poseLandmarks, poseWorldLandmarks, handLandmarks, tilt) {

        // ── Tremor ────────────────────────────────────────────────────────────
        let tremorLevel    = 0;
        let stabilityScore = 0;
        if (handLandmarks?.length > 0) {
            tremorLevel    = this.tremorEngine.update(handLandmarks[0]);
            stabilityScore = this.tremorEngine.getStabilityScore();
        } else {
            tremorLevel    = this.tremorEngine.getScore();
            stabilityScore = this.tremorEngine.getStabilityScore();
        }

        // ── Guard: need pose ──────────────────────────────────────────────────
        const now          = Date.now();
        const bodyDetected = poseLandmarks?.length >= 29;
        const hasWorld     = poseWorldLandmarks?.length >= 29;

        if (!bodyDetected || !hasWorld) {
            return {
                activity: this.currentState,
                isDrinking: this.currentState === 'Drinking',
                stabilityScore, tremorLevel,
                bodyDetected: false,
                confidence: this._getConfidence(),
                drinkSuccessCount: this.drinkSuccessCount,
            };
        }

        // ── Landmarks ─────────────────────────────────────────────────────────
        const nose          = poseLandmarks[0];
        const leftShoulder  = poseLandmarks[11];
        const rightShoulder = poseLandmarks[12];
        const leftElbow     = poseLandmarks[13];
        const rightElbow    = poseLandmarks[14];
        const leftWrist2D   = poseLandmarks[15];
        const rightWrist2D  = poseLandmarks[16];
        const leftHip2D     = poseLandmarks[23];
        const rightHip2D    = poseLandmarks[24];

        // World landmarks for knee angles (more reliable in 3-D)
        const wLeftHip   = poseWorldLandmarks[23];
        const wRightHip  = poseWorldLandmarks[24];
        const wLeftKnee  = poseWorldLandmarks[25];
        const wRightKnee = poseWorldLandmarks[26];
        const wLeftAnkle = poseWorldLandmarks[27];
        const wRightAnkle= poseWorldLandmarks[28];

        // ── Wrist proximity & elbow angles ────────────────────────────────────
        const lDist = Math.hypot(leftWrist2D.x  - nose.x, leftWrist2D.y  - nose.y);
        const rDist = Math.hypot(rightWrist2D.x - nose.x, rightWrist2D.y - nose.y);
        const wristToNose   = Math.min(lDist, rDist);
        const activeWrist2D = lDist < rDist ? leftWrist2D : rightWrist2D;
        const currentWristY = activeWrist2D.y;

        const lElbowAngle = angleBetweenPoints(leftShoulder,  leftElbow,  leftWrist2D);
        const rElbowAngle = angleBetweenPoints(rightShoulder, rightElbow, rightWrist2D);
        const elbowValid  = (lElbowAngle >= DRINK_ELBOW_MIN && lElbowAngle <= DRINK_ELBOW_MAX)
                         || (rElbowAngle >= DRINK_ELBOW_MIN && rElbowAngle <= DRINK_ELBOW_MAX);

        const gripDetected = isHoldingObject(handLandmarks);

        // ── Knee angles ───────────────────────────────────────────────────────
        const leftKneeAngle  = angleBetweenPoints(wLeftHip,  wLeftKnee,  wLeftAnkle);
        const rightKneeAngle = angleBetweenPoints(wRightHip, wRightKnee, wRightAnkle);

        // ── TILT ALERT ────────────────────────────────────────────────────────
        if (wristToNose > DRINK_WRIST_NOSE_GATE) {
            this.tiltWarningStartTime = 0;
            this.softActive = this.criticalActive = false;
        } else if (gripDetected && wristToNose < DRINK_WRIST_NOSE_CLOSE && elbowValid && tilt > 20) {
            if (!this.tiltWarningStartTime) this.tiltWarningStartTime = now;
            if (now - this.tiltWarningStartTime >= 600) {
                if (tilt >= CRITICAL_THRESHOLD && !this.criticalActive) {
                    this._speak('Danger. Tilt angle is too high.');
                    this.criticalActive = this.softActive = true;
                } else if (!this.softActive && !this.criticalActive) {
                    this._speak('Please hold the cup straight.');
                    this.softActive = true;
                }
            }
        } else {
            this.tiltWarningStartTime = 0;
            if (tilt < RESET_THRESHOLD) this.softActive = this.criticalActive = false;
        }

        // ── DRINKING DETECTION ────────────────────────────────────────────────
        // Conditions (all must hold):
        //   A) wrist is near the face (< DRINK_WRIST_NOSE_CLOSE)
        //   B) elbow is bent in a drinking-compatible range
        //   C) wrist is AT or ABOVE mouth level (nose.y in normalised = positive downward)
        //      — wrist Y <= nose Y + small buffer means wrist at or above nose
        //   D) grip is detected OR wrist is simply very close (hand may not be detected)
        //
        // We deliberately drop the hard grip requirement as a gate — grip detection
        // fails when the cup blocks the hand camera view. Instead we use proximity.

        const wristAtMouthLevel = activeWrist2D.y <= nose.y + 0.12;  // wrist near/above nose
        const handNearFace      = wristToNose < DRINK_WRIST_NOSE_CLOSE;
        const wristMovingUp     = (currentWristY - this.lastWristY) <= 0.015; // not sharply falling

        const drinkCondition = handNearFace && elbowValid && wristAtMouthLevel && wristMovingUp;

        if (!handNearFace) {
            // Hand is away — reset
            this.drinkingStartTime  = 0;
            this.isActuallyDrinking = false;
        } else if (drinkCondition) {
            if (!this.drinkingStartTime) this.drinkingStartTime = now;
            if (now - this.drinkingStartTime >= DRINK_HOLD_MS) {
                this.isActuallyDrinking = true;
            }
        } else {
            // Hand near face but wrong angle/level
            this.drinkingStartTime  = 0;
            this.isActuallyDrinking = false;
        }
        this.lastWristY = currentWristY;

        const drinkCounter = this.isActuallyDrinking ? SITTING_COUNTER_MAX : 0;

        // ── STANDING DETECTION ────────────────────────────────────────────────
        // Approach: use ONLY knee angles and the hip-above-knee geometry.
        // Do NOT check shoulder-hip horizontal alignment — unreliable when the
        // camera only shows upper body, or when patient leans forward.
        //
        // Standing signs:
        //   • Both knees near-straight (> STANDING_KNEE_MIN)
        //   • Hips above knees in world Y (MediaPipe world: Y positive downward,
        //     so hips have SMALLER y than knees when standing)

        const hipsAboveKnees = wLeftHip.y < wLeftKnee.y && wRightHip.y < wRightKnee.y;
        const kneesAreStraight = leftKneeAngle > STANDING_KNEE_MIN && rightKneeAngle > STANDING_KNEE_MIN;
        const standingCondition = kneesAreStraight && hipsAboveKnees;

        if (standingCondition) {
            if (!this.standingStartTime) this.standingStartTime = now;
            if (now - this.standingStartTime >= STANDING_CONFIRM_MS) {
                this.isActuallyStanding = true;
            }
        } else {
            this.standingStartTime = 0;
            // Only clear standing if knees are clearly bent
            if (leftKneeAngle < 145 || rightKneeAngle < 145) {
                this.isActuallyStanding = false;
            }
        }
        const standingCounter = this.isActuallyStanding ? SITTING_COUNTER_MAX : 0;

        // ── SITTING DETECTION ─────────────────────────────────────────────────
        // Sitting signs:
        //   • Both knees in sitting range (bent ~55°–130°)
        //   • Hips roughly at or below knee level in world Y
        //     (when seated, hips and knees are at similar height)
        //   • Hip Y in world coords is >= knee Y (hips NOT above knees)
        //
        // We use a smoothed counter rather than a hard time gate — this makes it
        // less jumpy for patients who shift in their chair.

        const leftSitting  = leftKneeAngle  >= SITTING_KNEE_MIN && leftKneeAngle  <= SITTING_KNEE_MAX;
        const rightSitting = rightKneeAngle >= SITTING_KNEE_MIN && rightKneeAngle <= SITTING_KNEE_MAX;
        // Hips at similar or lower height than knees = seated
        const hipsAtKneeLevel = wLeftHip.y >= wLeftKnee.y - 0.05 || wRightHip.y >= wRightKnee.y - 0.05;
        const sittingCondition = leftSitting && rightSitting && hipsAtKneeLevel;

        if (sittingCondition) {
            this.sittingCounter = Math.min(this.sittingCounter + 2, SITTING_COUNTER_MAX);
        } else {
            this.sittingCounter = Math.max(this.sittingCounter - 1, 0);
        }

        // ── STATE MACHINE ─────────────────────────────────────────────────────
        // Priority: Drinking > Standing > Sitting > Idle
        const sittingActive = this.sittingCounter >= SITTING_COUNTER_MAX * 0.6; // 60% threshold

        if (drinkCounter > 0) {
            this.currentState = 'Drinking';
        } else if (standingCounter > 0) {
            this.currentState = 'Standing';
        } else if (sittingActive) {
            this.currentState = 'Sitting';
        } else if (!sittingActive && standingCounter === 0 && drinkCounter === 0) {
            // Only drop to Idle if nothing is active
            if (this.currentState !== 'Sitting' || this.sittingCounter === 0) {
                this.currentState = 'Idle';
            }
        }

        // ── Drink completion ──────────────────────────────────────────────────
        const isDrinkingNow = this.currentState === 'Drinking';
        if (this.wasDrinking && !isDrinkingNow) {
            this.drinkSuccessCount++;
        }
        this.wasDrinking = isDrinkingNow;

        // ── Posture duration ──────────────────────────────────────────────────
        // Track how long patient has been in the current posture continuously
        if (this.currentState !== this._lastState) {
            this._postureStartTime = now;
            this._lastState = this.currentState;
        }
        const postureDurationMs = now - (this._postureStartTime || now);

        return {
            activity: this.currentState,
            isDrinking: isDrinkingNow,
            stabilityScore, tremorLevel,
            bodyDetected: true,
            confidence: this._getConfidence(),
            drinkSuccessCount: this.drinkSuccessCount,
            postureDurationMs,
            // Fall risk: high tremor + standing = elevated risk
            fallRisk: this.isActuallyStanding && tremorLevel > 35
                ? (tremorLevel > 65 ? 'high' : 'moderate')
                : 'low',
            debug: {
                wristToNose,
                lElbowAngle, rElbowAngle,
                leftKneeAngle, rightKneeAngle,
                hipsAboveKnees, hipsAtKneeLevel,
                kneesAreStraight,
                wristAtMouthLevel,
                drinkCondition,
                sittingCondition,
                standingCondition,
                drinkCounter,
                standingCounter,
                sittingCounter: this.sittingCounter,
                gripDetected,
            },
        };
    }

    _getConfidence() {
        switch (this.currentState) {
            case 'Drinking': return 100;
            case 'Standing': return this.isActuallyStanding ? 100 : 50;
            case 'Sitting':  return Math.round((this.sittingCounter / SITTING_COUNTER_MAX) * 100);
            default: return 0;
        }
    }

    reset() {
        this.tremorEngine.reset();
        this.softActive = this.criticalActive = false;
        this.lastSpokenMessage = '';
        this.lastSpokenTime    = 0;
        this.currentState      = 'Idle';
        this.sittingCounter    = 0;
        this.isActuallyStanding  = false;
        this.standingStartTime   = 0;
        this.isActuallyDrinking  = false;
        this.drinkingStartTime   = 0;
        this.wasDrinking         = false;
        this.drinkSuccessCount   = 0;
        this.tiltWarningStartTime = 0;
        this.lastWristY          = 0;
        this._postureStartTime   = 0;
        this._lastState          = 'Idle';
    }
}
