const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('../config/logger');

const WAV2LIP_DIR = path.resolve(__dirname, '../../wav2lip');
const DEFAULT_BASE_VIDEO = path.resolve(__dirname, '../../assets/Base-vedio.mp4');
const DEFAULT_OUTPUT_VIDEO = path.resolve(__dirname, '../../merged_output.mp4');
const DEFAULT_CHECKPOINT = path.join(WAV2LIP_DIR, 'checkpoints/wav2lip_gan.pth');
const INFERENCE_SCRIPT = path.join(WAV2LIP_DIR, 'inference.py');
const BASE_FACE_CACHE = path.resolve('Base-vedio.npy');
const MIN_BASE_VIDEO_BYTES = 1000000;

function assertUsableBaseVideo(facePath) {
    if (!fs.existsSync(facePath)) {
        throw new Error(`Missing base video for Wav2Lip at ${facePath}`);
    }

    const stats = fs.statSync(facePath);
    if (stats.size < MIN_BASE_VIDEO_BYTES) {
        throw new Error(
            `CRITICAL: Base video at ${facePath} is only ${(stats.size / 1024).toFixed(2)} KB. ` +
            `This is likely a Git LFS pointer or corrupted file. ` +
            `Please ensure you have pulled the actual file or deleted the stub to allow auto-download.`
        );
    }
}

function ensureWav2LipRuntime() {
    if (!fs.existsSync(WAV2LIP_DIR)) {
        throw new Error(`Wav2Lip directory not found at ${WAV2LIP_DIR}`);
    }

    if (!fs.existsSync(INFERENCE_SCRIPT)) {
        throw new Error(`Wav2Lip inference script not found at ${INFERENCE_SCRIPT}`);
    }

    const tempDir = path.join(WAV2LIP_DIR, 'temp');
    if (!fs.existsSync(tempDir)) {
        logger.info(`📁 Creating missing temp directory: ${tempDir}`);
        fs.mkdirSync(tempDir, { recursive: true });
    }
}

function resolvePremiumMode(options = {}) {
    const requested = options.restorer === 'gfpgan' || process.env.USE_PREMIUM_WAV2LIP === 'true';
    const restorerPath = options.restorerPath || path.join(WAV2LIP_DIR, 'checkpoints/GFPGANv1.4.pth');

    return {
        requested,
        restorerPath,
        enabled: requested && fs.existsSync(restorerPath),
    };
}

/**
 * Syncs lips of a face video with an audio file using Wav2Lip
 * @param {string} audioPath - Path to the source audio
 * @param {string} facePath - Path to the video containing the face
 * @param {string} outputPath - Path to save the synced video
 * @returns {Promise<string>} - Path to the generated video
 */
async function syncLip(audioPath, facePath, outputPath, options = {}) {
    // Resolve absolute paths
    const absAudioPath = path.resolve(audioPath);
    const absFacePath = path.resolve(facePath);
    const absOutputPath = path.resolve(outputPath);

    assertUsableBaseVideo(absFacePath);

    // Use "Elite" Sync Settings: bottom padding for chin + no smoothing for snapping
    const pads = options.pads || [0, 20, 0, 0]; // Extra bottom padding for chin movement
    const nosmooth = options.nosmooth !== undefined ? options.nosmooth : true; // Default to snap for tech content

    // Check for pre-computed face cache to save time
    const hasCache = fs.existsSync(BASE_FACE_CACHE);

    ensureWav2LipRuntime();

    logger.info(`👄 Starting Wav2Lip Sync (Safe Mode - CPU)...`);
    logger.debug(`Wav2Lip output=${absOutputPath} face=${absFacePath} audio=${absAudioPath}`);

    return new Promise((resolve, reject) => {
        // Use spawn for real-time streaming of logs
        const args = [
            INFERENCE_SCRIPT,
            '--checkpoint_path', DEFAULT_CHECKPOINT,
            '--face', absFacePath,
            '--audio', absAudioPath,
            '--outfile', absOutputPath,
            '--resize_factor', '1'
        ];

        // Pass face detection cache if it exists (Triggers OOM-safe streaming mode in inference.py)
        if (hasCache) {
            args.push('--face_det_results', BASE_FACE_CACHE);
            logger.info(`📦 Using pre-computed face boxes: ${BASE_FACE_CACHE}`);
        }

        // Add GFPGAN Premium Restoration if requested
        const premiumMode = resolvePremiumMode(options);
        if (premiumMode.requested) {
            if (premiumMode.enabled) {
                args.push('--restorer', 'gfpgan');
                args.push('--restorer_path', premiumMode.restorerPath);
                logger.info(`✨ Premium Mode: Using GFPGAN face restoration.`);
            } else {
                logger.warn(`⚠️ GFPGAN model not found at ${premiumMode.restorerPath}. Skipping premium restoration.`);
            }
        }

        const proc = spawn('python', args, { cwd: WAV2LIP_DIR });

        proc.stdout.on('data', (data) => {
            const output = data.toString().trim();
            if (output) logger.info(`[Wav2Lip] ${output}`);
        });

        proc.stderr.on('data', (data) => {
            const output = data.toString().trim();
            // TQDM often uses stderr, so we don't necessarily treat it as an error
            if (output.includes('it/s') || output.includes('%')) {
                logger.info(`[Wav2Lip Progress] ${output}`);
            } else {
                logger.debug(`[Wav2Lip Stderr] ${output}`);
            }
        });

        proc.on('close', (code) => {
            if (code !== 0) {
                logger.error(`❌ Wav2Lip Sync Failed with exit code ${code}`);
                return reject(new Error(`Wav2Lip failed with code ${code}`));
            }

            // VERIFICATION: Check if output file exists and is not 0 bytes
            if (!fs.existsSync(absOutputPath)) {
                return reject(new Error(`Wav2Lip finished but output file was NOT found at: ${absOutputPath}`));
            }

            const stats = fs.statSync(absOutputPath);
            if (stats.size === 0) {
                return reject(new Error(`Wav2Lip generated an EMPTY file at: ${absOutputPath}`));
            }

            logger.info(`✅ Wav2Lip Sync Successful: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
            resolve(absOutputPath);
        });
    });
}

/**
 * High Quality Lip Sync (Simulating app.py logic with GFPGAN if available)
 * For now, this just calls the basic syncLip.
 */
async function syncLipHQ(audioPath, facePath, outputPath) {
    logger.info(`✨ Running High-Quality Lip Sync (Experimental)`);
    // Ideally this would run inference, then GFPGAN, then merge.
    // For the initial integration, we use the basic sync.
    return syncLip(audioPath, facePath, outputPath);
}

async function createLipSyncedVideo({
    audioPath,
    baseVideoPath = DEFAULT_BASE_VIDEO,
    outputPath = DEFAULT_OUTPUT_VIDEO,
    options = {},
}) {
    if (!audioPath) {
        throw new Error('audioPath is required for lip-sync generation');
    }

    const videoPath = await syncLip(audioPath, baseVideoPath, outputPath, options);
    const premiumMode = resolvePremiumMode(options);

    return {
        videoPath,
        audioPath: path.resolve(audioPath),
        baseVideoPath: path.resolve(baseVideoPath),
        premiumMode: premiumMode.enabled,
    };
}

module.exports = { createLipSyncedVideo, syncLip, syncLipHQ };
