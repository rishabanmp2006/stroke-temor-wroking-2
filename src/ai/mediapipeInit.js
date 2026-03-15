/**
 * MediaPipe Tasks Vision - Hand & Pose Landmarker initialization
 *
 * Model files are served from the /public folder (downloaded locally) so they
 * load instantly without hitting Google CDN — which is slow/blocked in India.
 *
 * WASM runtime is still loaded from jsDelivr CDN (small, cached by browser).
 *
 * HOW TO ADD LOCAL MODELS (one-time setup):
 * ------------------------------------------
 * Run these 3 commands from your project root to download the model files
 * into /public/models (Vite serves /public at the root URL):
 *
 *   mkdir -p public/models
 *
 *   curl -L -o public/models/hand_landmarker.task \
 *     "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
 *
 *   curl -L -o public/models/pose_landmarker_full.task \
 *     "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task"
 *
 * After that, npm run dev will load models from localhost instantly.
 * For production (Vercel/Netlify), the /public folder is deployed automatically.
 */
import { HandLandmarker, PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

const TASKS_VISION_VERSION = '0.10.14'

// Local paths (served from /public by Vite). Falls back to Google CDN if local not found.
const LOCAL_HAND_MODEL = '/models/hand_landmarker.task'
const LOCAL_POSE_MODEL = '/models/pose_landmarker_full.task'
const CDN_HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const CDN_POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'

let handLandmarker = null
let poseLandmarker = null
let initialized = false
let initPromise = null

/**
 * Check if a local model file exists by doing a HEAD request.
 * Returns true if the file is available locally.
 */
async function localModelExists(path) {
    try {
        const res = await fetch(path, { method: 'HEAD' })
        return res.ok
    } catch {
        return false
    }
}

export async function initMediaPipe(onProgress) {
    if (initialized) return { handLandmarker, poseLandmarker }
    if (initPromise) return initPromise

    initPromise = (async () => {
        onProgress?.('Loading WASM runtime...')

        const vision = await FilesetResolver.forVisionTasks(
            `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`
        )

        // Prefer local models — check if they exist first
        const [hasLocalHand, hasLocalPose] = await Promise.all([
            localModelExists(LOCAL_HAND_MODEL),
            localModelExists(LOCAL_POSE_MODEL),
        ])

        const handModelPath = hasLocalHand ? LOCAL_HAND_MODEL : CDN_HAND_MODEL
        const poseModelPath = hasLocalPose ? LOCAL_POSE_MODEL : CDN_POSE_MODEL

        if (!hasLocalHand || !hasLocalPose) {
            onProgress?.('Downloading AI models from CDN (first time only, ~20MB)...')
            console.warn(
                '[NeuroGuard] Local model files not found — loading from Google CDN.\n' +
                'This is slow. Run the curl commands in mediapipeInit.js to set up local models.'
            )
        } else {
            onProgress?.('Loading local AI models...')
        }

        const [hl, pl] = await Promise.all([
            HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: handModelPath,
                    delegate: 'GPU',
                },
                runningMode: 'VIDEO',
                numHands: 1,
            }),
            PoseLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: poseModelPath,
                    delegate: 'GPU',
                },
                runningMode: 'VIDEO',
                numPoses: 1,
            }),
        ])

        handLandmarker = hl
        poseLandmarker = pl
        initialized = true
        return { handLandmarker, poseLandmarker }
    })()

    return initPromise
}

/** Reset so initMediaPipe can be called again (e.g. after a GPU error) */
export function resetMediaPipe() {
    handLandmarker = null
    poseLandmarker = null
    initialized = false
    initPromise = null
}

export function getHandLandmarker() { return handLandmarker }
export function getPoseLandmarker() { return poseLandmarker }
