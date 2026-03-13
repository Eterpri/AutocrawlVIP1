
import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai';
import { quotaManager } from './utils/quotaManager';
import { MODEL_CONFIGS, GLOSSARY_ANALYSIS_PROMPT } from './constants';
import { StoryInfo, FileItem } from './utils/types';

const CHUNK_SIZE_LIMIT = 8000; 
const MAX_RETRY_ATTEMPTS = 2;

const isMostlyChinese = (text: string): boolean => {
    if (!text) return false;
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
    // If more than 25% of the text is Chinese characters, it's likely not translated
    return (chineseChars.length / text.length) > 0.25; 
};

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE },
];

/**
 * Khởi tạo client AI với một API Key cụ thể.
 */
const getAiClient = (apiKey: string) => {
  if (!apiKey) {
    throw new Error("API Key không hợp lệ.");
  }
  return new GoogleGenAI({ apiKey });
};

const optimizeDictionary = (dictionary: string, content: string): string => {
  if (!content || !dictionary) return '';
  const lines = dictionary.split('\n');
  const uniqueMap = new Map<string, string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue; 
    const key = trimmed.substring(0, eqIndex).trim();
    if (key) uniqueMap.set(key, trimmed);
  }
  const usedLines: string[] = [];
  for (const [key, line] of uniqueMap.entries()) {
      if (content.includes(key)) usedLines.push(line);
  }
  return usedLines.join('\n');
};

const cleanupTranslatedText = (text: string, originalChapterName: string): string => {
    if (!text) return "";
    let lines = text.split('\n').map(l => l.trim()).filter(l => l !== "");
    
    // Các mẫu rác thường gặp sau khi dịch
    const JUNK_PATTERNS = [
        /đang đọc tại/i, /69shuba/i, /piaotian/i, /www\./i, /\.com/i, /\.net/i, 
        /truyện được dịch tại/i, /nguồn:/i, /chúc bạn đọc truyện vui vẻ/i,
        /bấm vào đây để/i, /theo dõi fanpage/i, /69 thư ba/i, /69 thư bar/i,
        /69 thư/i, /69shuba\.com/i, /69xinshu/i, /69shu/i
    ];
    
    lines = lines.filter(line => {
        // Nếu dòng quá ngắn và chứa pattern rác
        if (line.length < 60 && JUNK_PATTERNS.some(p => p.test(line))) return false;
        // Nếu dòng chứa URL
        if (line.includes('http://') || line.includes('https://')) return false;
        return true;
    });
    
    return lines.join('\n\n').trim();
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export const translateBatch = async (
    files: { id: string, content: string, name: string }[],
    userPrompt: string,
    dictionary: string,
    globalContext: string,
    allowedModelIds: string[],
    apiKey: string
): Promise<{ results: Map<string, string>, model: string }> => {
    const ai = getAiClient(apiKey);
    const finalResults = new Map<string, string>();
    let lastUsedModel = "";

    const systemInstruction = `VAI TRÒ: Dịch giả văn học Trung-Việt chuyên nghiệp.
NHIỆM VỤ: Dịch sát nghĩa, mượt mà, không bỏ sót.
QUY TẮC:
1. Dòng 1: Tiêu đề chương đã dịch.
2. Nội dung: Dịch đầy đủ, thuần Việt.
3. KHÔNG tóm tắt, KHÔNG thêm lời bình.`;

    for (const file of files) {
        const paragraphs = file.content.split('\n').filter(p => p.trim());
        let translatedFullContent = "";
        const relevantDictionary = optimizeDictionary(dictionary, file.content);

        let currentChunk = "";
        const chunks: string[] = [];
        for (const p of paragraphs) {
            if ((currentChunk.length + p.length) > CHUNK_SIZE_LIMIT) {
                chunks.push(currentChunk);
                currentChunk = p;
            } else {
                currentChunk += (currentChunk ? "\n" : "") + p;
            }
        }
        if (currentChunk) chunks.push(currentChunk);

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const isFirstChunk = i === 0;
            const contextPrompt = isFirstChunk 
                ? "Dịch tiêu đề ở dòng 1, sau đó dịch nội dung." 
                : "Tiếp tục dịch đoạn văn sau.";

            const fullPrompt = `[DICT]\n${relevantDictionary}\n\n[CTX]\n${globalContext}\n\n[INST]\n${contextPrompt}\n${userPrompt}\n\n[RAW]\n${chunk}`;
            
            let success = false;
            let errorMsg = "Không có phản hồi từ AI. Hãy kiểm tra kết nối mạng hoặc API Key.";

            for (const modelId of allowedModelIds) {
                // We don't check quotaManager.isModelAvailable here because the caller (App.tsx) 
                // should have picked an available key/model combo.
                // But for safety, we can check if the specific key is available for this model.
                if (!quotaManager.isKeyAvailable(apiKey, modelId)) continue;

                for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
                    try {
                        const response = await ai.models.generateContent({
                            model: modelId,
                            contents: fullPrompt,
                            config: { 
                                systemInstruction, 
                                temperature: 0.1,
                                safetySettings
                            }
                        });

                        const output = response.text;
                        if (!output) {
                            const candidate = response.candidates?.[0];
                            if (candidate?.finishReason === 'SAFETY') {
                                throw new Error("Nội dung bị chặn bởi bộ lọc an toàn của AI (Safety Filter). Hãy thử điều chỉnh prompt hoặc từ điển.");
                            }
                            if (candidate?.finishReason === 'RECITATION') {
                                throw new Error("Nội dung bị chặn do vi phạm bản quyền (Recitation).");
                            }
                            throw new Error(`AI trả về nội dung trống. Lý do: ${candidate?.finishReason || 'Không xác định'}`);
                        }
                        
                        if (isMostlyChinese(output) && chunk.length > 100) {
                            throw new Error("AI trả về nội dung chưa dịch (vẫn còn tiếng Trung). Có thể do prompt chưa đủ mạnh hoặc model đang gặp lỗi.");
                        }

                        translatedFullContent += (translatedFullContent ? "\n\n" : "") + output.trim();
                        lastUsedModel = modelId;
                        quotaManager.recordRequest(apiKey, modelId);
                        success = true;
                        break;
                    } catch (error: any) {
                        const status = error.status || error.response?.status || 0;
                        let errorDetail = error.message || "Lỗi không xác định";
                        
                        if (status === 400) errorDetail = "Yêu cầu không hợp lệ (400). Kiểm tra lại API Key hoặc cấu hình.";
                        if (status === 403) errorDetail = "API Key không có quyền truy cập hoặc bị cấm (403).";
                        if (status === 404) errorDetail = "Model không tồn tại hoặc không khả dụng (404).";
                        if (status === 500) errorDetail = "Lỗi máy chủ AI (500). Hãy thử lại sau.";
                        if (status === 503) errorDetail = "Dịch vụ AI đang quá tải hoặc bảo trì (503).";
                        
                        errorMsg = errorDetail;
                        
                        // Record error in quota manager
                        quotaManager.recordError(apiKey, modelId, errorMsg, status);
                        
                        const isQuotaError = status === 429 || 
                                           errorMsg.includes("429") || 
                                           errorMsg.includes("quota") || 
                                           errorMsg.includes("Resource has been exhausted") ||
                                           errorMsg.includes("rate limit");

                        if (isQuotaError) {
                            throw error; 
                        }
                        
                        if (attempt === MAX_RETRY_ATTEMPTS) break;
                        await delay(1000 * attempt);
                    }
                }
                if (success) break;
            }

            if (!success) {
                throw new Error(errorMsg);
            }
            await delay(300);
        }
        
        finalResults.set(file.id, cleanupTranslatedText(translatedFullContent, file.name));
    }

    return { results: finalResults, model: lastUsedModel };
};

export const analyzeStoryContext = async (
    chapters: FileItem[],
    storyInfo: StoryInfo,
    apiKey: string
): Promise<string> => {
    const ai = getAiClient(apiKey);
    const sampleText = chapters.slice(0, 2).map(c => c.content.substring(0, 2000)).join('\n\n');
    const modelId = 'gemini-3.1-pro-preview';

    try {
        const response = await ai.models.generateContent({
            model: modelId,
            contents: `${GLOSSARY_ANALYSIS_PROMPT}\n\nTRUYỆN: ${storyInfo.title}\nNỘI DUNG:\n${sampleText}`,
            config: { temperature: 0.2 }
        });
        quotaManager.recordRequest(apiKey, modelId);
        return response.text || "";
    } catch (e: any) {
        const status = e.status || e.response?.status || 0;
        const errorMsg = e.message || "";
        quotaManager.recordError(apiKey, modelId, errorMsg, status);
        throw e;
    }
};
