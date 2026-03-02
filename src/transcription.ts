/**
 * Voice note transcription via OpenAI Whisper API.
 * Called from src/channels/slack.ts when an audio file is attached.
 *
 * Requires OPENAI_API_KEY in .env.
 * Cost: ~$0.006/min of audio (~$0.003 per typical 30-second voice note).
 *
 * To disable, simply don't set OPENAI_API_KEY — falls back to a plain file reference.
 */
import fs from 'fs';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';

// Slack audio mime types (voice notes are usually audio/webm;codecs=opus on mobile)
const AUDIO_MIME_PREFIXES = ['audio/', 'video/'];

export function isAudioMimetype(mimetype: string): boolean {
  const m = mimetype.toLowerCase().split(';')[0].trim();
  return AUDIO_MIME_PREFIXES.some(prefix => m.startsWith(prefix));
}

export async function transcribeAudioFile(filePath: string): Promise<string | null> {
  const env = readEnvFile(['OPENAI_API_KEY']);
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) {
    logger.debug('OPENAI_API_KEY not set — voice transcription skipped');
    return null;
  }

  try {
    const openaiModule = await import('openai');
    const OpenAI = openaiModule.default;
    const toFile = openaiModule.toFile;

    const openai = new OpenAI({ apiKey });

    const buffer = fs.readFileSync(filePath);
    const ext = filePath.split('.').pop()?.split('-').pop() || 'ogg';
    const mimeType = `audio/${ext}`;

    const file = await toFile(buffer, `voice.${ext}`, { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      response_format: 'text',
    });

    const text = (transcription as unknown as string).trim();
    logger.info({ chars: text.length, filePath }, 'Voice message transcribed');
    return text || null;
  } catch (err) {
    logger.error({ err, filePath }, 'OpenAI transcription failed');
    return null;
  }
}
