const GROQ_TRANSCRIBE = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3-turbo";
const MAX_BYTES = 25 * 1024 * 1024;

const HINT = "A personal week manager update from Anant, in English or Hinglish. Useful terms: ET AI, Akuna Capital, Golden Jubilee, DSA, RL SLP, stochastic probability, hackathon, application, resume, Pocket FM, Devfolio.";

/**
 * Telegram voice notes are OGG/Opus, which Groq accepts directly — so this
 * needs no ffmpeg step.
 */
export async function transcribeVoice({ groqKey, telegramToken, voice, fetchImpl = fetch }) {
  if (!groqKey) throw new Error("Voice is not set up yet: GROQ_API_KEY is missing.");
  if (!voice?.file_id) throw new Error("That voice note had no file attached.");
  if (voice.file_size && voice.file_size > MAX_BYTES) {
    throw new Error("That voice note is over the 25 MB limit. Could you send a shorter one?");
  }

  const fileInfo = await fetchImpl(`https://api.telegram.org/bot${telegramToken}/getFile?file_id=${encodeURIComponent(voice.file_id)}`);
  const fileBody = await fileInfo.json();
  if (!fileBody?.ok || !fileBody.result?.file_path) throw new Error("Telegram would not hand over that voice note.");

  const audio = await fetchImpl(`https://api.telegram.org/file/bot${telegramToken}/${fileBody.result.file_path}`);
  if (!audio.ok) throw new Error(`Could not download the voice note: ${audio.status}`);
  const bytes = await audio.arrayBuffer();

  const form = new FormData();
  form.append("model", MODEL);
  form.append("prompt", HINT);
  form.append("response_format", "text");
  form.append("file", new Blob([bytes], { type: "audio/ogg" }), "voice.ogg");

  const response = await fetchImpl(GROQ_TRANSCRIBE, {
    method: "POST",
    headers: { authorization: `Bearer ${groqKey}` },
    body: form,
  });

  if (response.status === 429) throw new Error("Voice transcription hit its free daily limit. Could you send that as text?");
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Transcription failed: ${response.status} ${detail.slice(0, 160)}`);
  }

  const transcript = (await response.text()).trim();
  if (!transcript) throw new Error("That voice note came back empty. Could you try again?");
  return transcript.slice(0, 12000);
}
