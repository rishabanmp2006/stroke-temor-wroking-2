/**
 * Geometric calculation utilities for AI engine
 */

/**
 * Returns angle in degrees between vectors (A→B) and (A→C)
 */
export function angleBetweenVectors(a, b, c) {
    const vec1 = { x: b.x - a.x, y: b.y - a.y }
    const vec2 = { x: c.x - a.x, y: c.y - a.y }
    const dot = vec1.x * vec2.x + vec1.y * vec2.y
    const mag1 = Math.sqrt(vec1.x ** 2 + vec1.y ** 2)
    const mag2 = Math.sqrt(vec2.x ** 2 + vec2.y ** 2)
    if (mag1 === 0 || mag2 === 0) return 0
    return Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2)))) * (180 / Math.PI)
}

/**
 * Calculate wrist tilt angle using wrist (0) and index MCP (5)
 * Returns angle from vertical (0 = perfectly upright)
 */
export function calcWristAngle(landmarks) {
    if (!landmarks || landmarks.length < 6) return 0
    const wrist = landmarks[0]
    const indexMCP = landmarks[5]
    const vertical = { x: wrist.x, y: wrist.y - 0.1 } // point directly above wrist
    return angleBetweenVectors(wrist, indexMCP, vertical)
}

/**
 * Euclidean distance between two landmarks (normalized 0-1 space)
 */
export function landmarkDistance(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z || 0) - (b.z || 0)) ** 2)
}

/**
 * Calculates the inner angle at vertex B formed by points A, B, C
 * Returns angle in degrees [0, 180]
 */
export function angleBetweenPoints(a, b, c) {
    if (!a || !b || !c) return 0
    // Vector BA
    const ba = { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) }
    // Vector BC
    const bc = { x: c.x - b.x, y: c.y - b.y, z: (c.z || 0) - (b.z || 0) }

    const dotProduct = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z
    const magBA = Math.sqrt(ba.x ** 2 + ba.y ** 2 + ba.z ** 2)
    const magBC = Math.sqrt(bc.x ** 2 + bc.y ** 2 + bc.z ** 2)

    if (magBA === 0 || magBC === 0) return 0

    let angleRad = Math.acos(Math.max(-1, Math.min(1, dotProduct / (magBA * magBC))))
    return angleRad * (180 / Math.PI)
}

/**
 * Returns statistical variance of a number array
 */
export function variance(arr) {
    if (arr.length < 2) return 0
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length
    return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length
}

/**
 * Calculate wrist displacement variance from a position history array
 * history: Array of {x, y} positions
 */
export function calcWristDisplacementVariance(history) {
    if (history.length < 3) return 0
    const dists = []
    for (let i = 1; i < history.length; i++) {
        dists.push(Math.sqrt((history[i].x - history[i - 1].x) ** 2 + (history[i].y - history[i - 1].y) ** 2))
    }
    return variance(dists)
}

/**
 * Estimate oscillation frequency (Hz) in a displacement series
 * Counts zero-crossings around mean per second
 */
export function estimateOscillationFreq(displacements, windowSeconds = 3) {
    if (displacements.length < 10) return 0
    const mean = displacements.reduce((s, v) => s + v, 0) / displacements.length
    let crossings = 0
    for (let i = 1; i < displacements.length; i++) {
        if ((displacements[i - 1] - mean) * (displacements[i] - mean) < 0) crossings++
    }
    return crossings / (2 * windowSeconds) // Hz
}

/**
 * Condition C: Grip posture detected
 * Distance between thumb tip and index tip is small OR fingers form curved holding shape.
 */
export function isHoldingObject(handLandmarks) {
    if (!handLandmarks || handLandmarks.length < 21) return false
    const wrist = handLandmarks[0]
    const thumbTip = handLandmarks[4]
    const indexTip = handLandmarks[8]
    const middleMCP = handLandmarks[9]
    const middleTip = handLandmarks[12]

    // Distance between thumb tip and index tip is small
    const pinchDist = landmarkDistance(thumbTip, indexTip)
    const isPinch = pinchDist < 0.08

    // Fingers form curved holding shape
    // Check if middle fingertip is closer to the wrist than the MCP point,
    // which indicates a curled finger.
    const tipToWrist = landmarkDistance(middleTip, wrist)
    const mcpToWrist = landmarkDistance(middleMCP, wrist)
    const isCurved = tipToWrist < mcpToWrist * 1.2 && tipToWrist > 0.05

    return isPinch || isCurved
}

/**
 * Normalization Base: Shoulder Width
 * Returns distance between left shoulder (11) and right shoulder (12)
 */
export function calcShoulderWidth(poseLandmarks) {
    if (!poseLandmarks || poseLandmarks.length < 13) return 0.1
    return landmarkDistance(poseLandmarks[11], poseLandmarks[12])
}

/**
 * Normalization Base: Torso Height
 * Returns distance between shoulder midpoint and hip midpoint
 */
export function calcTorsoHeight(poseLandmarks) {
    if (!poseLandmarks || poseLandmarks.length < 25) return 0.1

    const shoulderMidX = (poseLandmarks[11].x + poseLandmarks[12].x) / 2
    const shoulderMidY = (poseLandmarks[11].y + poseLandmarks[12].y) / 2
    const shoulderMidZ = ((poseLandmarks[11].z || 0) + (poseLandmarks[12].z || 0)) / 2
    const shoulderMid = { x: shoulderMidX, y: shoulderMidY, z: shoulderMidZ }

    const hipMidX = (poseLandmarks[23].x + poseLandmarks[24].x) / 2
    const hipMidY = (poseLandmarks[23].y + poseLandmarks[24].y) / 2
    const hipMidZ = ((poseLandmarks[23].z || 0) + (poseLandmarks[24].z || 0)) / 2
    const hipMid = { x: hipMidX, y: hipMidY, z: hipMidZ }

    return landmarkDistance(shoulderMid, hipMid)
}
