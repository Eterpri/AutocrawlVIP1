
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { 
  FileText, Download, Trash2, AlertCircle, CheckCircle, Loader2, Settings, Zap, Sparkles, ChevronDown, RefreshCw, Languages, Plus, Search, Link2, Book, Brain, Type, Volume2, VolumeX, SkipBack, SkipForward, LogOut, Eye, EyeOff, Menu, ScrollText, Key, ExternalLink, Github, HelpCircle, AlertTriangle, X, PlusCircle, History, Hourglass, Info, Wand2, FileArchive, ArrowRight, Play, Pause, Square, Sliders, Coffee, Sun, Moon, FileOutput, Save, BookOpen, ToggleLeft, ToggleRight, Wand, UploadCloud, Smartphone, Maximize2, Minimize2, MoreHorizontal, FileSearch, PlayCircle, ShieldCheck, CheckSquare, Square as SquareIcon, FileCode
} from 'lucide-react';
import { FileItem, FileStatus, StoryProject, ReaderSettings } from './utils/types';
import { DEFAULT_PROMPT, MODEL_CONFIGS, AVAILABLE_LANGUAGES, AVAILABLE_GENRES, AVAILABLE_PERSONALITIES, AVAILABLE_SETTINGS, AVAILABLE_FLOWS, DEFAULT_DICTIONARY } from './constants';
import { translateBatch, analyzeStoryContext } from './geminiService';
import { createMergedFile, downloadTextFile, fetchContentFromUrl, unzipFiles, generateEpub, translateChapterTitle } from './utils/fileHelpers';
import { replacePromptVariables } from './utils/textHelpers';
import { saveProject, getAllProjects, deleteProject } from './utils/storage';
import { quotaManager } from './utils/quotaManager';

const MAX_CONCURRENCY = 1; 
const BATCH_FILE_LIMIT = 1;

const getStatusLabel = (status: FileStatus) => {
    switch (status) {
        case FileStatus.IDLE: return { label: 'Chờ dịch', color: 'bg-slate-100 text-slate-500' };
        case FileStatus.PROCESSING: return { label: 'Đang dịch...', color: 'bg-indigo-100 text-indigo-600 animate-pulse' };
        case FileStatus.COMPLETED: return { label: 'Đã xong', color: 'bg-emerald-100 text-emerald-600' };
        case FileStatus.ERROR: return { label: 'Lỗi', color: 'bg-rose-100 text-rose-600' };
        default: return { label: 'Chờ', color: 'bg-slate-100 text-slate-500' };
    }
};

const generateId = () => {
    try {
        return crypto.randomUUID();
    } catch (e) {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }
};

const App: React.FC = () => {
  const [projects, setProjects] = useState<StoryProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingQueue, setProcessingQueue] = useState<string[]>([]);
  const [activeWorkers, setActiveWorkers] = useState<number>(0);
  const [showLinkModal, setShowLinkModal] = useState<boolean>(false);
  const [showContextSetup, setShowContextSetup] = useState<boolean>(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState<boolean>(false);
  const [showTTSSettings, setShowTTSSettings] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  
  const [linkInput, setLinkInput] = useState<string>("");
  const [isAutoCrawlEnabled, setIsAutoCrawlEnabled] = useState<boolean>(true);
  const [isFetchingLinks, setIsFetchingLinks] = useState<boolean>(false);
  const isFetchingLinksRef = useRef<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // New features states
  const [crawlOption, setCrawlOption] = useState<'single' | 'multi'>('multi');
  const [isCrawlOnly, setIsCrawlOnly] = useState<boolean>(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  
  // Multi API Key States
  const [apiKeys, setApiKeys] = useState<string[]>(() => {
    const saved = localStorage.getItem('GEMINI_API_KEYS');
    if (saved) return JSON.parse(saved);
    const oldKey = localStorage.getItem('CUSTOM_GEMINI_API_KEY') || localStorage.getItem('gemini_api_key');
    return oldKey ? [oldKey] : [];
  });
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [keyCooldowns, setKeyCooldowns] = useState<Record<string, number>>({});

  const [isWakeLockActive, setIsWakeLockActive] = useState<boolean>(false);
  const wakeLockRef = useRef<any>(null);

  const [viewingFileId, setViewingFileId] = useState<string | null>(null);
  const [viewingRawId, setViewingRawId] = useState<string | null>(null); 
  const [toasts, setToasts] = useState<{id: string, message: string, type: string}[]>([]);

  // Reader States
  const [isReaderUIHidden, setIsReaderUIHidden] = useState<boolean>(false);
  const [deviceType, setDeviceType] = useState<'mobile' | 'desktop'>('desktop');
  
  const activeLineRef = useRef<HTMLDivElement>(null);
  const isReaderActiveRef = useRef<boolean>(false); 
  const synthesisRef = useRef<SpeechSynthesis | null>(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [activeTTSIndex, setActiveTTSIndex] = useState<number>(-1);
  const [isTTSPaused, setIsTTSPaused] = useState<boolean>(false);
  const [isTTSPlaying, setIsTTSPlaying] = useState<boolean>(false);
  const autoPlayNextRef = useRef<boolean>(false);

  const currentProject = useMemo(() => projects.find(p => p.id === currentProjectId) || null, [projects, currentProjectId]);

  const [readerSettings, setReaderSettings] = useState<ReaderSettings>({
      fontSize: 20,
      bgColor: 'bg-[#f4ecd8] text-slate-900 border-[#e5dec5]',
      fontFamily: 'font-serif',
      ttsRate: 1.2,
      ttsPitch: 1.0,
      ttsVoice: '',
      showOriginal: false,
      isAutoScrollActive: true,
      isImmersiveMode: false
  });

  const [newProjectInfo, setNewProjectInfo] = useState({
      title: '', author: '', languages: ['Convert thô'], genres: ['Tiên Hiệp'], mcPersonality: ['Trầm ổn/Già dặn'], worldSetting: ['Trung Cổ/Cổ Đại'], sectFlow: ['Phàm nhân lưu']
  });

  useEffect(() => {
    localStorage.setItem('GEMINI_API_KEYS', JSON.stringify(apiKeys));
  }, [apiKeys]);

  const addApiKey = () => {
    if (!apiKeyInput.trim()) return;
    if (apiKeys.includes(apiKeyInput.trim())) {
      addToast("Key này đã tồn tại trong danh sách", "warning");
      return;
    }
    setApiKeys(prev => [...prev, apiKeyInput.trim()]);
    setApiKeyInput('');
    addToast("Đã thêm API Key mới", "success");
  };

  const removeApiKey = (keyToRemove: string) => {
    setApiKeys(prev => prev.filter(k => k !== keyToRemove));
    addToast("Đã xóa API Key", "info");
  };

  const getAvailableApiKey = useCallback(() => {
    const now = Date.now();
    const sysKey = process.env.API_KEY;
    if (sysKey && !keyCooldowns[sysKey]) return sysKey;
    const available = apiKeys.find(k => !keyCooldowns[k] || keyCooldowns[k] < now);
    return available || sysKey || null;
  }, [apiKeys, keyCooldowns]);

  const markKeyAsCooldown = (key: string, duration: number = 60000) => {
    setKeyCooldowns(prev => ({ ...prev, [key]: Date.now() + duration }));
  };

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) setDeviceType('mobile');
    else if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Opera Mini/i.test(ua)) setDeviceType('mobile');
    else setDeviceType('desktop');
  }, []);

  const addToast = useCallback((message: any, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    const id = generateId();
    setToasts(prev => [...prev, { id, message: String(message), type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const toggleWakeLock = async () => {
    if (!('wakeLock' in navigator)) { addToast("Không hỗ trợ giữ sáng", "warning"); return; }
    try {
        if (isWakeLockActive) {
            if (wakeLockRef.current) await wakeLockRef.current.release();
            setIsWakeLockActive(false);
        } else {
            wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
            setIsWakeLockActive(true);
            wakeLockRef.current.addEventListener('release', () => setIsWakeLockActive(false));
        }
    } catch (err: any) { console.error(err); }
  };

  useEffect(() => {
    const updateVoices = () => {
        if (!synthesisRef.current) return;
        let voices = synthesisRef.current.getVoices();
        let filtered = voices.filter(v => v.lang.startsWith('vi') || v.lang.startsWith('en'));
        setAvailableVoices(filtered);
    };
    updateVoices();
    if (synthesisRef.current) synthesisRef.current.onvoiceschanged = updateVoices;
  }, []);

  useEffect(() => { getAllProjects().then(setProjects); }, []);

  const updateProject = (id: string, updates: Partial<StoryProject>) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates, lastModified: Date.now() } : p));
  };

  const persistProject = async (project: StoryProject) => {
    try { await saveProject(project); } catch (e) { console.error("Save failed", e); }
  };

  useEffect(() => { if (currentProject) persistProject(currentProject); }, [currentProject?.lastModified]);

  const handleAIAnalyze = async () => {
    if (!currentProject) return;
    const key = getAvailableApiKey();
    if (!key) { addToast("Hết API Key khả dụng. Vui lòng thêm hoặc chờ cooldown.", "error"); return; }

    setIsAnalyzing(true);
    try {
        const result = await analyzeStoryContext(currentProject.chapters, currentProject.info, key);
        updateProject(currentProject.id, { globalContext: result });
        addToast("Phân tích AI hoàn tất!", "success");
    } catch (e: any) {
        if (e.status === 429 || e.message?.includes("Resource has been exhausted")) {
          markKeyAsCooldown(key, 300000); 
          addToast("Key hiện tại hết quota, vui lòng thử lại sau giây lát.", "warning");
        } else {
          addToast(e.message, "error");
        }
    } finally { setIsAnalyzing(false); }
  };

  const createNewProject = async () => {
    if (!newProjectInfo.title.trim()) return;
    const projectId = generateId();
    const newProject: StoryProject = {
      id: projectId, info: { ...newProjectInfo }, chapters: [],
      promptTemplate: DEFAULT_PROMPT, dictionary: DEFAULT_DICTIONARY, globalContext: "",
      createdAt: Date.now(), lastModified: Date.now()
    };
    await saveProject(newProject);
    setProjects(prev => [...prev, newProject]);
    setCurrentProjectId(projectId);
    setShowNewProjectModal(false);
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Xóa truyện?")) return;
    await deleteProject(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    if (currentProjectId === id) setCurrentProjectId(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentProject || !e.target.files?.length) return;
    const files = e.target.files;
    let newChapters: FileItem[] = [];
    let nextOrder = currentProject.chapters.length;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            if (file.name.endsWith('.zip')) {
                const unzipped = await unzipFiles(file, nextOrder);
                newChapters = [...newChapters, ...unzipped];
                nextOrder += unzipped.length;
            } else {
                const content = await file.text();
                newChapters.push({ 
                    id: generateId(), name: translateChapterTitle(file.name.replace('.txt', '')), 
                    orderIndex: nextOrder++, content, translatedContent: null, status: FileStatus.IDLE, 
                    retryCount: 0, originalCharCount: content.length, remainingRawCharCount: 0 
                });
            }
        } catch (err) { addToast(`Lỗi: ${file.name}`, "error"); }
    }
    updateProject(currentProject.id, { chapters: [...currentProject.chapters, ...newChapters] });
  };

  const handleLinkCrawl = async (targetUrl?: string, chainCount: number = 1) => {
    if (!currentProject || isFetchingLinksRef.current) return;
    const startUrl = targetUrl || linkInput;
    if (!startUrl) return;
    
    isFetchingLinksRef.current = true;
    setIsFetchingLinks(true);
    setShowLinkModal(false);
    
    try {
        const result = await fetchContentFromUrl(startUrl);
        const nextOrder = currentProject.chapters.length;
        const chapterId = generateId();
        const newChapter: FileItem = { 
            id: chapterId, name: translateChapterTitle(result.title), orderIndex: nextOrder,
            content: result.content, translatedContent: null, status: FileStatus.IDLE, 
            retryCount: 0, originalCharCount: result.content.length, remainingRawCharCount: 0 
        };
        
        setProjects(prev => prev.map(p => p.id === currentProject.id ? { 
            ...p, chapters: [...p.chapters, newChapter], lastCrawlUrl: result.nextUrl || startUrl, lastModified: Date.now()
        } : p));

        // If not "crawl only", add to queue
        if (!isCrawlOnly) {
          if (isProcessing) {
            setProcessingQueue(prev => [...new Set([...prev, chapterId])]);
          } else {
            // Trigger auto processing if needed
            // setProcessingQueue([chapterId]);
            // setIsProcessing(true);
          }
        }

        // Chain crawling if multi is selected
        if (chainCount > 1 && result.nextUrl) {
          isFetchingLinksRef.current = false;
          await new Promise(r => setTimeout(r, 1000)); // Delay between crawls to be safe
          handleLinkCrawl(result.nextUrl, chainCount - 1);
        }
    } catch (e: any) { 
      addToast(e.message, "error");
      if (isProcessing) setIsAutoCrawlEnabled(false);
    } finally {
        isFetchingLinksRef.current = false; 
        setIsFetchingLinks(false); 
        if (chainCount <= 1) setLinkInput("");
    }
  };

  const handleExportEpub = async () => {
    if (!currentProject) return;
    try {
      const blob = await generateEpub(currentProject.chapters, currentProject.info);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentProject.info.title}.epub`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) { addToast(e.message, "error"); }
  };

  const handleExportTxt = () => {
    if (!currentProject) return;
    const content = createMergedFile(currentProject.chapters);
    downloadTextFile(`${currentProject.info.title}.txt`, content);
    addToast("Đã xuất file dịch (TXT)", "success");
  };

  const handleExportRawTxt = () => {
    if (!currentProject) return;
    const rawContent = [...currentProject.chapters]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(f => `### ${f.name}\n\n${f.content}`)
      .join('\n\n');
    downloadTextFile(`${currentProject.info.title}_Goc.txt`, rawContent);
    addToast("Đã xuất file gốc (TXT)", "success");
  };

  const startTranslation = useCallback((retryAll: boolean = false) => {
    if (!currentProject) return;
    const toProcess = currentProject.chapters.filter(c => retryAll ? true : (c.status === FileStatus.IDLE || c.status === FileStatus.ERROR)).map(c => c.id);
    if (toProcess.length === 0) {
        if (isAutoCrawlEnabled && currentProject.lastCrawlUrl) {
            handleLinkCrawl(currentProject.lastCrawlUrl);
            setIsProcessing(true);
            return;
        }
        addToast("Không có chương mới cần dịch", "info");
        return;
    }
    setProcessingQueue(prev => [...new Set([...prev, ...toProcess])]);
    setIsProcessing(true);
  }, [currentProject, isAutoCrawlEnabled, isCrawlOnly]);

  const stopTranslation = useCallback(() => {
    setIsProcessing(false); 
    setProcessingQueue([]);
    addToast("Đã dừng tiến trình dịch", "info");
  }, []);

  const handleBulkDelete = () => {
    if (!currentProject || selectedChapterIds.length === 0) return;
    if (!confirm(`Bạn có chắc muốn xóa ${selectedChapterIds.length} chương đã chọn?`)) return;
    
    updateProject(currentProject.id, {
      chapters: currentProject.chapters.filter(c => !selectedChapterIds.includes(c.id))
    });
    setSelectedChapterIds([]);
    setIsSelectionMode(false);
    addToast(`Đã xóa ${selectedChapterIds.length} chương`, "success");
  };

  const toggleSelection = (id: string) => {
    setSelectedChapterIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const selectAll = () => {
    if (!currentProject) return;
    if (selectedChapterIds.length === currentProject.chapters.length) {
      setSelectedChapterIds([]);
    } else {
      setSelectedChapterIds(currentProject.chapters.map(c => c.id));
    }
  };

  useEffect(() => {
    if (!isProcessing || !currentProjectId) return;
    
    if (processingQueue.length === 0 && activeWorkers === 0) {
        if (isAutoCrawlEnabled && currentProject?.lastCrawlUrl && !isFetchingLinksRef.current) {
            handleLinkCrawl(currentProject.lastCrawlUrl);
            return;
        } else if (!isFetchingLinksRef.current) {
            setIsProcessing(false);
            return;
        }
    }
    
    if (processingQueue.length === 0 || activeWorkers >= MAX_CONCURRENCY) return;

    const processBatch = async () => {
        const batchIds = processingQueue.slice(0, BATCH_FILE_LIMIT);
        const apiKey = getAvailableApiKey();

        if (!apiKey) {
            addToast("Hết API Key khả dụng. Đang chờ 30 giây...", "warning");
            await new Promise(r => setTimeout(r, 30000));
            return; 
        }

        setProcessingQueue(prev => prev.slice(BATCH_FILE_LIMIT));
        setActiveWorkers(prev => prev + 1);

        setProjects(prev => prev.map(p => p.id === currentProjectId ? {
            ...p, chapters: p.chapters.map(c => batchIds.includes(c.id) ? { ...c, status: FileStatus.PROCESSING, errorMessage: undefined } : c)
        } : p));

        try {
            const targetProj = projects.find(p => p.id === currentProjectId);
            if (!targetProj) return;
            const prompt = replacePromptVariables(targetProj.promptTemplate, targetProj.info);
            const { results, model } = await translateBatch(
              targetProj.chapters.filter(c => batchIds.includes(c.id)).map(c => ({ id: c.id, content: c.content, name: c.name })), 
              prompt, targetProj.dictionary, targetProj.globalContext, MODEL_CONFIGS.map(m => m.id),
              apiKey
            );
            
            setProjects(prev => prev.map(p => p.id === currentProjectId ? { ...p, lastModified: Date.now(), chapters: p.chapters.map(c => {
                if (batchIds.includes(c.id)) {
                    const translated = results.get(c.id);
                    if (translated) {
                        const lines = translated.split('\n');
                        const firstLine = lines[0].trim();
                        let aiTranslatedName = c.name;
                        if ((firstLine.toLowerCase().includes('chương') || firstLine.toLowerCase().includes('tiết')) && firstLine.length < 100) {
                            aiTranslatedName = translateChapterTitle(firstLine);
                        }
                        return { ...c, name: aiTranslatedName, status: FileStatus.COMPLETED, translatedContent: translated, usedModel: model };
                    }
                    return { ...c, status: FileStatus.ERROR, errorMessage: "Dữ liệu trả về không hợp lệ" };
                }
                return c;
            }) } : p));
        } catch (e: any) {
            if (e.status === 429 || e.message?.includes("Resource has been exhausted") || e.message?.includes("429")) {
                markKeyAsCooldown(apiKey, 60000); 
                addToast("Key hiện tại đạt giới hạn, tự động chuyển sang Key tiếp theo...", "info");
                setProcessingQueue(prev => [...batchIds, ...prev]);
            } else {
                setProjects(prev => prev.map(p => p.id === currentProjectId ? { ...p, chapters: p.chapters.map(c => batchIds.includes(c.id) ? { ...c, status: FileStatus.ERROR, errorMessage: e.message } : c) } : p));
            }
        } finally { 
            setTimeout(() => setActiveWorkers(prev => prev - 1), 1000); 
        }
    };
    processBatch();
  }, [isProcessing, processingQueue, activeWorkers, currentProjectId, isAutoCrawlEnabled, currentProject?.lastCrawlUrl, getAvailableApiKey]);

  const sortedChapters = useMemo(() => {
    if (!currentProject) return [];
    return [...currentProject.chapters].sort((a, b) => a.orderIndex - b.orderIndex);
  }, [currentProject]);

  const viewingChapter = useMemo(() => sortedChapters.find(c => c.id === viewingFileId) || null, [sortedChapters, viewingFileId]);
  const viewingRawFile = useMemo(() => sortedChapters.find(c => c.id === viewingRawId) || null, [sortedChapters, viewingRawId]);

  const stopTTS = useCallback(() => {
    if (synthesisRef.current) {
        synthesisRef.current.cancel();
    }
    setActiveTTSIndex(-1); 
    setIsTTSPaused(false); 
    setIsTTSPlaying(false);
  }, []);

  const playTTS = useCallback((startIndex: number = 0) => {
    if (!isReaderActiveRef.current || !viewingChapter?.translatedContent || !synthesisRef.current) { 
        stopTTS(); 
        return; 
    }
    
    synthesisRef.current.cancel();
    const paragraphs = viewingChapter.translatedContent.split('\n').filter(p => p.trim());
    
    if (startIndex >= paragraphs.length) { 
        const currentIndex = sortedChapters.findIndex(c => c.id === viewingChapter.id);
        if (currentIndex !== -1 && currentIndex < sortedChapters.length - 1) {
            const nextCh = sortedChapters[currentIndex + 1];
            if (nextCh.status === FileStatus.COMPLETED) {
                autoPlayNextRef.current = true;
                setViewingFileId(nextCh.id);
                addToast(`Đã xong chương. Tự động chuyển đến ${nextCh.name}`, "info");
                return;
            }
        }
        stopTTS(); 
        return; 
    }

    if (startIndex < 0) startIndex = 0;

    setActiveTTSIndex(startIndex);
    setIsTTSPaused(false);
    setIsTTSPlaying(true);

    const utterance = new SpeechSynthesisUtterance(paragraphs[startIndex]);
    utterance.lang = 'vi-VN';
    utterance.rate = readerSettings.ttsRate || 1.2;
    utterance.pitch = readerSettings.ttsPitch || 1.0;
    
    if (readerSettings.ttsVoice) {
        const v = synthesisRef.current.getVoices().find(v => v.voiceURI === readerSettings.ttsVoice);
        if (v) utterance.voice = v;
    }

    utterance.onend = () => { 
        if (!isTTSPaused && isReaderActiveRef.current) {
            playTTS(startIndex + 1); 
        }
    };

    utterance.onerror = (event) => {
        if (event.error !== 'interrupted') {
            setIsTTSPlaying(false);
        }
    };

    synthesisRef.current.speak(utterance);
  }, [viewingChapter, sortedChapters, readerSettings, stopTTS, isTTSPaused, addToast]);

  useEffect(() => {
    if (autoPlayNextRef.current && viewingChapter && isReaderActiveRef.current) {
        autoPlayNextRef.current = false;
        setTimeout(() => playTTS(0), 1000);
    }
  }, [viewingFileId, viewingChapter, playTTS]);

  const toggleTTSPause = () => {
    if (!synthesisRef.current) return;
    if (synthesisRef.current.speaking) {
        if (synthesisRef.current.paused) { 
            synthesisRef.current.resume(); 
            setIsTTSPaused(false); 
        } else { 
            synthesisRef.current.pause(); 
            setIsTTSPaused(true); 
        }
    } else {
        playTTS(activeTTSIndex === -1 ? 0 : activeTTSIndex);
    }
  };

  const openReader = (id: string) => { setViewingFileId(id); setIsReaderUIHidden(false); isReaderActiveRef.current = true; };
  const closeReader = () => { isReaderActiveRef.current = false; stopTTS(); setViewingFileId(null); };

  useEffect(() => {
      if (activeTTSIndex !== -1 && activeLineRef.current) {
          activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
  }, [activeTTSIndex]);

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans">
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 glass-panel border-r border-slate-200 transition-transform duration-300 lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="p-8 border-b border-slate-100">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-indigo-600 rounded-[1.25rem] flex items-center justify-center shadow-lg"><Languages className="w-7 h-7 text-white" /></div>
              <h1 className="font-display font-bold text-2xl text-slate-800 tracking-tight">Novel<span className="text-indigo-600">Pro</span></h1>
            </div>
            <button onClick={() => setShowNewProjectModal(true)} className="w-full flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg active:scale-95"><PlusCircle className="w-5 h-5" />Tạo Truyện Mới</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
            {projects.map(p => (
              <div key={p.id} onClick={() => { setCurrentProjectId(p.id); setIsSidebarOpen(false); }} className={`group flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all ${currentProjectId === p.id ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-slate-100'}`}>
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className={`p-2.5 rounded-xl shrink-0 ${currentProjectId === p.id ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-200 text-slate-500'}`}><FileText className="w-4 h-4" /></div>
                  <div className="truncate"><p className={`font-bold text-sm truncate ${currentProjectId === p.id ? 'text-indigo-900' : 'text-slate-700'}`}>{String(p.info.title || "Chưa đặt tên")}</p><p className="text-xs text-slate-400 font-medium">{p.chapters.length} chương</p></div>
                </div>
                <button onClick={(e) => handleDeleteProject(p.id, e)} className="opacity-0 group-hover:opacity-100 p-2 hover:bg-rose-100 text-rose-500 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <div className="p-6 border-t border-slate-100 space-y-3">
            <button 
              onClick={() => setShowSettings(true)} 
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-semibold ${apiKeys.length > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}
            >
              {apiKeys.length > 0 ? <ShieldCheck className="w-5 h-5 text-emerald-600" /> : <Key className="w-5 h-5 text-rose-500" />}
              {apiKeys.length > 0 ? `${apiKeys.length} API Key Sẵn Sàng` : "Chưa Thiết Lập Key"}
            </button>
            <button onClick={toggleWakeLock} className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-semibold ${isWakeLockActive ? 'bg-amber-100 text-amber-700' : 'text-slate-600 hover:bg-slate-100'}`}>{isWakeLockActive ? <Sun className="w-5 h-5 animate-pulse" /> : <Moon className="w-5 h-5" />}{isWakeLockActive ? "Đang giữ sáng" : "Giữ sáng màn hình"}</button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-transparent overflow-hidden">
        <header className="h-20 glass-panel border-b border-slate-200 flex items-center justify-between px-8 shrink-0 z-40">
          <div className="flex items-center gap-4"><button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2.5 hover:bg-slate-100 rounded-2xl transition-all"><Menu className="w-6 h-6 text-slate-600" /></button><h2 className="font-display font-bold text-xl text-slate-800 truncate max-w-[150px] sm:max-w-md">{currentProject ? String(currentProject.info.title) : "AI Novel Pro"}</h2></div>
          {currentProject && (
            <div className="flex items-center gap-3">
                <button onClick={() => setShowContextSetup(true)} className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl hover:bg-indigo-100 transition-all flex items-center gap-2 font-bold text-sm shadow-sm"><Brain className="w-5 h-5" /><span className="hidden sm:inline">Bối cảnh</span></button>
                <button onClick={() => isProcessing ? stopTranslation() : startTranslation(false)} className={`flex items-center gap-2 ${isProcessing ? 'bg-rose-500 hover:bg-rose-600' : 'bg-indigo-600 hover:bg-indigo-700'} text-white font-bold py-3 px-6 rounded-2xl text-sm shadow-xl active:scale-95 transition-all disabled:opacity-50`}>{isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}{isProcessing ? "Dừng" : "Dịch Ngay"}</button>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {!currentProject ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto"><div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center mb-8 text-slate-300 shadow-xl border border-slate-100"><Book className="w-12 h-12" /></div><h2 className="text-2xl font-bold text-slate-800 mb-3 font-display">Bắt đầu dịch thuật!</h2><button onClick={() => setShowNewProjectModal(true)} className="flex items-center gap-3 bg-indigo-600 text-white font-bold py-5 px-10 rounded-3xl shadow-2xl active:scale-95 transition-all text-lg"><Plus className="w-6 h-6" />Tạo Dự Án</button></div>
          ) : (
            <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
                <div className="flex flex-wrap items-center justify-between gap-4 bg-white/50 p-6 rounded-[2.5rem] border border-slate-100 backdrop-blur-sm">
                    <div className="flex flex-wrap gap-4">
                      <input type="file" id="up" className="hidden" multiple accept=".txt,.zip" onChange={handleFileUpload} />
                      <label htmlFor="up" className="flex items-center gap-3 bg-white border-2 border-slate-100 p-4 rounded-3xl cursor-pointer hover:border-indigo-400 font-bold text-slate-600 shadow-md transition-all active:scale-95"><PlusCircle className="w-6 h-6 text-indigo-500" />Thêm File</label>
                      <button onClick={() => setShowLinkModal(true)} className="flex items-center gap-3 bg-white border-2 border-slate-100 p-4 rounded-3xl hover:border-amber-400 font-bold text-slate-600 shadow-md transition-all active:scale-95"><Link2 className="w-6 h-6 text-amber-500" />Cào Link</button>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <div className="flex gap-2 bg-white p-2 rounded-3xl shadow-md border-2 border-slate-100">
                            <button onClick={handleExportTxt} className="flex items-center gap-2 bg-slate-100 text-slate-600 p-3 rounded-2xl hover:bg-slate-200 font-bold transition-all"><FileOutput className="w-5 h-5" />Dịch</button>
                            <button onClick={handleExportRawTxt} title="Xuất file gốc chưa dịch" className="flex items-center gap-2 bg-slate-100 text-slate-600 p-3 rounded-2xl hover:bg-slate-200 font-bold transition-all"><FileCode className="w-5 h-5" />Gốc</button>
                            <button onClick={handleExportEpub} className="flex items-center gap-2 bg-indigo-600 text-white p-3 rounded-2xl hover:bg-indigo-700 font-bold transition-all"><BookOpen className="w-5 h-5" />EPUB</button>
                        </div>
                        
                        <div className="flex gap-2 bg-white p-2 rounded-3xl shadow-md border-2 border-slate-100">
                            <button onClick={() => setIsSelectionMode(!isSelectionMode)} className={`flex items-center gap-2 p-3 rounded-2xl font-bold transition-all ${isSelectionMode ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                {isSelectionMode ? <CheckSquare className="w-5 h-5" /> : <SquareIcon className="w-5 h-5" />}
                                {isSelectionMode ? 'Hủy chọn' : 'Chọn nhiều'}
                            </button>
                            {isSelectionMode && (
                              <>
                                <button onClick={selectAll} className="p-3 bg-slate-100 text-slate-600 rounded-2xl font-bold">Tất cả</button>
                                <button onClick={handleBulkDelete} disabled={selectedChapterIds.length === 0} className="flex items-center gap-2 bg-rose-500 text-white p-3 rounded-2xl hover:bg-rose-600 font-bold disabled:opacity-50 transition-all">
                                  <Trash2 className="w-5 h-5" /> ({selectedChapterIds.length})
                                </button>
                              </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {sortedChapters.map((ch) => {
                        const { label, color } = getStatusLabel(ch.status);
                        const isSelected = selectedChapterIds.includes(ch.id);
                        return (
                            <div 
                              key={ch.id} 
                              onClick={() => {
                                if (isSelectionMode) {
                                  toggleSelection(ch.id);
                                } else if (ch.status === FileStatus.COMPLETED) {
                                  openReader(ch.id);
                                }
                              }} 
                              className={`bg-white p-6 rounded-[2rem] border transition-all relative overflow-hidden group cursor-pointer ${isSelected ? 'border-indigo-500 shadow-indigo-100 shadow-xl' : 'border-slate-100 hover:shadow-2xl'} ${ch.status === FileStatus.COMPLETED && !isSelectionMode ? 'hover:scale-[1.02]' : ''}`}
                            >
                                {isSelectionMode && (
                                  <div className={`absolute top-4 left-4 z-10 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-200'}`}>
                                    {isSelected && <CheckCircle className="w-4 h-4 text-white" />}
                                  </div>
                                )}
                                <div className="absolute top-0 right-0 p-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => { e.stopPropagation(); setViewingRawId(ch.id); }} title="Xem bản gốc" className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all"><ScrollText className="w-4 h-4" /></button>
                                    {!isSelectionMode && (
                                      <button onClick={(e) => { e.stopPropagation(); updateProject(currentProject.id, { chapters: currentProject.chapters.filter(c => c.id !== ch.id) }); }} className="p-2 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all"><Trash2 className="w-4 h-4" /></button>
                                    )}
                                </div>
                                <h4 className="font-bold text-slate-800 truncate mb-4 text-lg mt-2" title={String(ch.name)}>{String(ch.name)}</h4>
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full ${color}`}>{label}</span>
                                        {ch.status === FileStatus.COMPLETED && !isSelectionMode && <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl"><Eye className="w-5 h-5" /></div>}
                                    </div>
                                    {ch.status === FileStatus.ERROR && ch.errorMessage && (
                                        <p className="text-[10px] text-rose-500 font-bold leading-tight">{ch.errorMessage}</p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
          )}
        </div>
      </main>

      {showSettings && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] w-full max-w-2xl p-10 shadow-premium space-y-8 animate-in zoom-in-95 duration-300 relative flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-2xl font-display text-slate-800">Quản lý Multi API Keys</h3>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400"><X className="w-6 h-6" /></button>
            </div>
            
            <div className="space-y-4">
              <label className="text-sm font-bold text-slate-700 px-1">Thêm Gemini API Key mới</label>
              <div className="flex gap-3">
                <input 
                  type="password" 
                  placeholder="Dán AIza... Key tại đây" 
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="flex-1 p-5 rounded-[1.5rem] bg-slate-50 border-2 border-slate-100 focus:border-indigo-500 outline-none font-mono text-sm transition-all shadow-inner"
                />
                <button onClick={addApiKey} className="bg-indigo-600 text-white px-8 rounded-[1.5rem] font-bold hover:bg-indigo-700 transition-all flex items-center gap-2">
                  <Plus className="w-5 h-5" /> Thêm
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
              <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest px-1">Danh sách Key ({apiKeys.length})</p>
              {apiKeys.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                  <p className="text-sm font-medium text-slate-400 italic">Chưa có API Key nào được thêm.</p>
                </div>
              ) : (
                apiKeys.map((key, index) => {
                  const isCoolingDown = keyCooldowns[key] && keyCooldowns[key] > Date.now();
                  return (
                    <div key={index} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl group hover:shadow-md transition-all">
                      <div className="flex items-center gap-4 overflow-hidden">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isCoolingDown ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                          {isCoolingDown ? <Hourglass className="w-5 h-5 animate-pulse" /> : <ShieldCheck className="w-5 h-5" />}
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-mono font-bold text-slate-700 truncate">••••••••{key.slice(-8)}</p>
                          <p className="text-[10px] font-bold uppercase tracking-tight text-slate-400">
                            {isCoolingDown ? 'Đang cooldown' : 'Sẵn sàng'}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => removeApiKey(key)} className="p-2.5 text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-6 bg-indigo-50 rounded-[2rem] border border-indigo-100">
              <p className="text-[10px] text-indigo-700 font-medium leading-relaxed">
                <Info className="w-3 h-3 inline mr-1 mb-0.5" />
                Hệ thống sẽ tự động xoay vòng Key khi một Key đạt giới hạn Quota. Khuyên dùng ít nhất 3-5 Keys cho truyện dài.
              </p>
            </div>
          </div>
        </div>
      )}

      {viewingChapter && (
          <div className={`fixed inset-0 z-[100] flex flex-col transition-all duration-700 ${readerSettings.bgColor}`}>
              <div className={`fixed top-0 inset-x-0 z-[110] transition-all flex items-center justify-between px-6 h-16 glass-panel border-b ${isReaderUIHidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
                <button onClick={closeReader} className="p-2 hover:bg-black/10 rounded-2xl"><ArrowRight className="w-6 h-6 rotate-180" /></button>
                <div className="flex flex-col items-center max-w-[50%]">
                    <h3 className="font-bold text-sm truncate w-full text-center">{String(viewingChapter.name)}</h3>
                    {isTTSPlaying && <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping"></div><span className="text-[9px] font-bold text-indigo-600 uppercase">Đang phát âm thanh</span></div>}
                </div>
                <button onClick={() => setShowTTSSettings(!showTTSSettings)} className={`p-3 rounded-2xl transition-all ${showTTSSettings ? 'bg-indigo-600 text-white' : 'hover:bg-black/10'}`}><Sliders className="w-5 h-5" /></button>
              </div>

              {showTTSSettings && (
                  <div className={`fixed z-[120] bg-white rounded-[2rem] shadow-2xl p-6 border border-slate-100 transition-all ${deviceType === 'mobile' ? 'bottom-0 inset-x-0 rounded-b-none' : 'bottom-24 right-8 w-80'}`}>
                      <div className="flex items-center justify-between mb-4"><h4 className="font-bold text-slate-800 text-sm">Cấu hình TTS</h4><button onClick={() => setShowTTSSettings(false)} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400"><X className="w-4 h-4" /></button></div>
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Giọng nói</label>
                            <select value={readerSettings.ttsVoice} onChange={(e) => setReaderSettings(prev => ({...prev, ttsVoice: e.target.value}))} className="w-full p-3 rounded-xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-xs appearance-none">
                                <option value="">Hệ thống</option>
                                {availableVoices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Tốc độ {readerSettings.ttsRate}x</label>
                                <input type="range" min="0.5" max="2.5" step="0.1" value={readerSettings.ttsRate} onChange={(e) => setReaderSettings(prev => ({ ...prev, ttsRate: parseFloat(e.target.value) }))} className="w-full accent-indigo-600" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Tông {readerSettings.ttsPitch}x</label>
                                <input type="range" min="0.5" max="2.0" step="0.1" value={readerSettings.ttsPitch} onChange={(e) => setReaderSettings(prev => ({ ...prev, ttsPitch: parseFloat(e.target.value) }))} className="w-full accent-indigo-600" />
                            </div>
                        </div>
                      </div>
                  </div>
              )}

              <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pt-24 pb-32" onClick={() => setIsReaderUIHidden(!isReaderUIHidden)}>
                  <div className="max-w-3xl mx-auto space-y-4">
                    <h1 className="text-2xl font-display font-bold mb-12 text-center opacity-90 leading-tight">{String(viewingChapter.name)}</h1>
                    {viewingChapter.translatedContent?.split('\n').filter(p => p.trim()).map((line, idx) => (
                        <p 
                            key={idx} 
                            ref={activeTTSIndex === idx ? activeLineRef : null}
                            onClick={(e) => { e.stopPropagation(); playTTS(idx); }}
                            className={`p-4 rounded-2xl transition-all border-2 border-transparent hover:bg-black/5 text-lg leading-relaxed cursor-pointer ${activeTTSIndex === idx ? 'bg-indigo-500/10 border-indigo-500/30 font-medium' : 'opacity-90'}`}
                            style={{ fontSize: `${readerSettings.fontSize}px` }}
                        >
                            {line.trim()}
                        </p>
                    ))}
                  </div>
              </div>

              <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[110] transition-all duration-500 ${isReaderUIHidden && isTTSPlaying && !isTTSPaused ? 'translate-y-24 opacity-0 scale-90' : 'translate-y-0 opacity-100 scale-100'}`}>
                <div className="flex items-center gap-4 p-3 bg-white/40 backdrop-blur-2xl rounded-[3rem] border border-white/30 shadow-2xl">
                    <button onClick={(e) => { e.stopPropagation(); stopTTS(); }} className="p-4 hover:bg-black/10 rounded-full transition-all text-current"><Square className="w-5 h-5 fill-current" /></button>
                    <button onClick={(e) => { e.stopPropagation(); toggleTTSPause(); }} className="p-7 bg-indigo-600 text-white rounded-full shadow-xl hover:scale-105 active:scale-95 transition-all">
                        {isTTSPlaying && !isTTSPaused ? <Pause className="w-8 h-8 fill-white" /> : <Play className="w-8 h-8 fill-white translate-x-0.5" />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); playTTS(activeTTSIndex + 1); }} className="p-4 hover:bg-black/10 rounded-full transition-all text-current"><SkipForward className="w-5 h-5 fill-current" /></button>
                </div>
              </div>
          </div>
      )}
      
      {showNewProjectModal && (<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"><div className="bg-white rounded-[3rem] w-full max-w-xl p-10 shadow-2xl space-y-6"><h3 className="font-bold text-2xl">Tạo truyện mới</h3><input type="text" placeholder="Tên truyện" value={newProjectInfo.title} onChange={(e) => setNewProjectInfo({...newProjectInfo, title: e.target.value})} className="w-full p-5 rounded-[1.5rem] bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none font-bold" /><div className="flex gap-4 pt-4"><button onClick={() => setShowNewProjectModal(false)} className="flex-1 font-bold text-slate-400">Hủy</button><button onClick={createNewProject} className="flex-[2] bg-indigo-600 text-white font-bold py-5 rounded-[1.5rem] shadow-xl">Xác nhận</button></div></div></div>)}

      {showLinkModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-[3rem] w-full max-w-xl p-10 shadow-2xl space-y-8 animate-in zoom-in-95 duration-300">
            <h3 className="font-bold text-2xl">Cào Link Truyện</h3>
            <div className="space-y-4">
              <input 
                type="text" 
                placeholder="Dán link chương tại đây (VD: Piaotia, Biquge...)" 
                value={linkInput} 
                onChange={(e) => setLinkInput(e.target.value)} 
                className="w-full p-5 rounded-[1.5rem] bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none font-medium transition-all" 
              />
              
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setCrawlOption('single')} 
                  className={`p-4 rounded-2xl font-bold transition-all border-2 ${crawlOption === 'single' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-slate-50 border-transparent text-slate-500'}`}
                >
                  Cào 1 chương
                </button>
                <button 
                  onClick={() => setCrawlOption('multi')} 
                  className={`p-4 rounded-2xl font-bold transition-all border-2 ${crawlOption === 'multi' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-slate-50 border-transparent text-slate-500'}`}
                >
                  Cào 10 chương tiếp
                </button>
              </div>

              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl cursor-pointer select-none" onClick={() => setIsCrawlOnly(!isCrawlOnly)}>
                <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${isCrawlOnly ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                  {isCrawlOnly && <CheckCircle className="w-4 h-4 text-white" />}
                </div>
                <span className="font-bold text-slate-600 text-sm">Chỉ cào nội dung gốc (không tự động dịch)</span>
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button onClick={() => setShowLinkModal(false)} className="flex-1 font-bold text-slate-400">Hủy</button>
              <button onClick={() => handleLinkCrawl(linkInput, crawlOption === 'multi' ? 10 : 1)} className="flex-[2] bg-indigo-600 text-white font-bold py-5 rounded-[1.5rem] shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3">
                <Zap className="w-5 h-5 fill-current" /> Bắt đầu nạp
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showContextSetup && currentProject && (<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"><div className="bg-white rounded-[3rem] w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden"><div className="px-10 py-8 border-b flex items-center justify-between"><h3 className="font-bold text-2xl">Bối cảnh & Từ điển</h3><button onClick={() => setShowContextSetup(false)} className="p-2.5 hover:bg-slate-100 rounded-2xl"><X className="w-7 h-7 text-slate-400" /></button></div><div className="flex-1 overflow-y-auto p-10 grid grid-cols-2 gap-8"><div className="space-y-2"><label className="text-xs font-extrabold text-slate-400 uppercase tracking-widest px-2">Từ điển (Gốc=Dịch)</label><textarea value={currentProject.dictionary} onChange={e => updateProject(currentProject.id, { dictionary: e.target.value })} className="w-full h-full min-h-[400px] p-6 rounded-[2rem] bg-slate-50 border-2 border-transparent focus:border-indigo-400 outline-none font-mono text-sm" /></div><div className="space-y-2"><label className="text-xs font-extrabold text-slate-400 uppercase tracking-widest px-2">Bối cảnh</label><textarea value={currentProject.globalContext} onChange={e => updateProject(currentProject.id, { globalContext: e.target.value })} className="w-full h-full min-h-[400px] p-6 rounded-[2rem] bg-slate-50 border-2 border-transparent focus:border-indigo-400 outline-none text-sm" /></div></div><div className="p-8 bg-slate-50 border-t flex justify-end gap-4"><button onClick={handleAIAnalyze} disabled={isAnalyzing} className="flex items-center gap-2 px-6 py-4 bg-amber-50 text-amber-600 rounded-2xl font-bold text-sm hover:bg-amber-100">{isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand className="w-4 h-4" />}AI Phân Tích</button><button onClick={() => setShowContextSetup(false)} className="bg-indigo-600 text-white font-bold py-4 px-12 rounded-2xl shadow-xl">Lưu cấu hình</button></div></div></div>)}

      {viewingRawId && viewingRawFile && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <div className="bg-white rounded-[3rem] w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                    <h3 className="font-bold text-2xl">Nội dung gốc</h3>
                    <button onClick={() => setViewingRawId(null)} className="p-3 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-2xl"><X className="w-7 h-7" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-slate-50/50">
                    <pre className="whitespace-pre-wrap font-sans text-lg text-slate-700 leading-relaxed">{viewingRawFile.content}</pre>
                </div>
            </div>
        </div>
      )}

      <div className="fixed bottom-8 right-8 z-[200] flex flex-col gap-4 pointer-events-none">{toasts.map(t => (<div key={t.id} className={`pointer-events-auto flex items-center gap-4 px-8 py-5 rounded-[2rem] shadow-soft border-2 animate-in slide-in-from-right duration-500 min-w-[320px] backdrop-blur-md ${t.type === 'success' ? 'bg-emerald-50/90 text-emerald-800 border-emerald-100' : t.type === 'error' ? 'bg-rose-50/90 text-rose-800 border-rose-100' : 'bg-white/90 text-slate-800 border-slate-100'}`}><div className={`p-2 rounded-xl ${t.type === 'success' ? 'bg-emerald-500' : t.type === 'error' ? 'bg-rose-500' : 'bg-indigo-500'} text-white`}>{t.type === 'success' ? <CheckCircle className="w-5 h-5" /> : t.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <Info className="w-5 h-5" />}</div><span className="font-bold text-sm">{t.message}</span></div>))}</div>
      {!viewingFileId && (isFetchingLinks || isProcessing) && (<div className="fixed bottom-10 left-10 z-[150] glass-panel p-5 rounded-[2.5rem] shadow-2xl flex items-center gap-5"><div className="w-12 h-12 rounded-full border-4 border-slate-100 border-t-indigo-600 animate-spin" /><div className="pr-4"><p className="font-bold text-sm text-slate-800 uppercase tracking-widest">{isProcessing ? 'Dịch tự động' : 'Cào dữ liệu'}</p><p className="text-[10px] font-bold text-indigo-500 opacity-70">SYSTEM ACTIVE • MULTI KEY MODE</p></div></div>)}
    </div>
  );
};

export default App;
