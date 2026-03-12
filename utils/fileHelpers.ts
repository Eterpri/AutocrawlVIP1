
import JSZip from 'jszip';
import { FileItem, FileStatus, StoryInfo } from './types';

const PROXY_LIST = [
    "/api/proxy?url=",
    "https://api.allorigins.win/raw?url=",
    "https://corsproxy.io/?",
    "https://api.codetabs.com/v1/proxy?quest=",
    "https://thingproxy.freeboard.io/fetch/"
];

const JUNK_PHRASES = [
    "重要声明", "本站", "版权归", "All rights reserved", "最新章节", "永久地址", 
    "网友发表", "来自搜索引擎", "本站立场无关", "www.", ".com", ".net", ".org",
    "点击下一页", "继续阅读", "顶点小说", "笔趣阁", "69书吧", "飘天文学", "shubao", "paoshu",
    "手机用户请访问", "推荐阅读", "sodu", "txt下载", "chm下载", "uukanshu", "biquge",
    "content_bottom", "content_top", "read_ads", "read-ads", "center-ads", "piaotian"
];

const PAGINATION_KEYWORDS = ["下一页", "下一頁", "next page", "2/2", "3/3", "2/3", "(2)", "(3)"];

/**
 * Chuyển đổi tiêu đề chương
 */
export const translateChapterTitle = (title: string): string => {
  let clean = title.trim();
  clean = clean.replace(/第\s*(\d+)\s*[章話节回]/g, 'Chương $1');
  clean = clean.replace(/Chapter\s*(\d+)/gi, 'Chương $1');
  const hanVietMap: Record<string, string> = { '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6', '七': '7', '八': '8', '九': '9', '十': '10' };
  clean = clean.replace(/第\s*([一二三四五六七八九十]+)\s*[章話节回]/g, (match, p1) => hanVietMap[p1] || p1);
  return clean;
};

const isChineseUrl = (url: string): boolean => {
    const domains = ['.cn', '.com.cn', 'piaotia', '69shuba', 'biquge', 'shubao', 'paoshu', 'uukanshu', 'paoshu8', 'xbiquge', 'readwn', '69xinshu', 'ptwxz', '顶点', '笔趣阁'];
    return domains.some(d => url.toLowerCase().includes(d));
};

const resolveUrl = (base: string, relative: string) => {
    try { return new URL(relative, base).href; } catch (e) { return relative; }
};

/**
 * Làm sạch nội dung văn bản thô từ Piaotia và các web tương tự
 */
const cleanScrapedText = (text: string): string => {
    return text
        .replace(/&nbsp;/g, ' ')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+/g, ' ') // Xóa space thừa
        .replace(/\n\s*\n/g, '\n\n') // Xóa dòng trống thừa
        .trim();
};

/**
 * Cào nội dung với cơ chế đệ quy trang và xử lý mã hóa đặc thù
 */
export const fetchContentFromUrl = async (url: string, isPaginationCall = false): Promise<{ title: string, content: string, nextUrl: string | null }> => {
    let lastError = "";
    const cleanUrl = url.trim();

    for (const proxyBase of PROXY_LIST) {
        try {
            const finalUrl = `${proxyBase}${encodeURIComponent(cleanUrl)}`;
            const response = await fetch(finalUrl);
            if (!response.ok) {
                console.warn(`Proxy ${proxyBase} returned error ${response.status}: ${response.statusText}`);
                continue;
            }

            const buffer = await response.arrayBuffer();
            
            // 1. Kiểm tra header Content-Type trước
            const contentType = response.headers.get('content-type') || '';
            let charset = '';
            const charsetMatch = contentType.match(/charset=([^;]+)/i);
            if (charsetMatch) charset = charsetMatch[1].toLowerCase();

            // 2. Nếu không có trong header, thử giải mã sơ bộ để tìm trong thẻ meta
            let html = '';
            if (!charset) {
                // Giải mã bằng latin1 (ISO-8859-1) để giữ nguyên byte ASCII, giúp tìm tag charset chính xác hơn
                const tempHtml = new TextDecoder('iso-8859-1').decode(buffer);
                const metaMatch = tempHtml.match(/<meta[^>]+charset=["']?([^"'>\s/]+)/i) || 
                                 tempHtml.match(/charset=["']?([^"'>\s/]+)/i);
                if (metaMatch) {
                    charset = metaMatch[1].toLowerCase();
                }
            }

            // 3. Giải mã thực sự
            try {
                // Ưu tiên charset tìm được, nếu không có thì thử gbk (phổ biến ở web truyện Trung) rồi mới đến utf-8
                const decoderCharset = charset || (isChineseUrl(cleanUrl) ? 'gbk' : 'utf-8');
                html = new TextDecoder(decoderCharset).decode(buffer);
                
                // Kiểm tra xem có bị lỗi font (nhiều ký tự lạ \ufffd) không, nếu có thử lại với gbk/utf-8 ngược lại
                // Chúng ta đếm số lượng ký tự lỗi, nếu quá nhiều thì chắc chắn sai encoding
                const errorCharCount = (html.match(/\ufffd/g) || []).length;
                if (errorCharCount > 10) {
                     const fallbackCharset = decoderCharset.includes('utf') ? 'gbk' : 'utf-8';
                     html = new TextDecoder(fallbackCharset).decode(buffer);
                }
            } catch (e) {
                html = new TextDecoder('utf-8').decode(buffer);
            }

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // 1. Xử lý tiêu đề
            const h1 = doc.querySelector('h1');
            const title = translateChapterTitle(h1?.innerText || doc.title?.split('_')[0] || "Chương mới");

            // 2. Dọn dẹp các thành phần rác (Ads, Scripts)
            doc.querySelectorAll('script, style, iframe, ins, .ads, #ads, .author-say, .read-notice, .bottom-ad, [style*="display:none"], [style*="visibility:hidden"]').forEach(el => el.remove());

            // 3. Tìm vùng nội dung (Piaotia dùng #content)
            const selectors = ['#content', '#article', '#chaptercontent', '.content', '.showtxt', '.read-content', 'article'];
            let container: HTMLElement | null = null;
            for (const s of selectors) {
                const el = doc.querySelector(s) as HTMLElement;
                if (el && el.innerText.trim().length > 100) {
                    container = el;
                    break;
                }
            }
            if (!container) container = doc.body;

            // Xử lý loại bỏ text rác lồng trong style (thay cho getComputedStyle)
            container.querySelectorAll('*').forEach(el => {
                const styleAttr = el.getAttribute('style') || "";
                if (styleAttr.includes('display:none') || styleAttr.includes('visibility:hidden') || styleAttr.includes('font-size:0')) {
                    el.remove();
                }
            });

            // Tách dòng thông minh bằng cách thay <br> thành xuống dòng trước khi lấy innerText
            const cloned = container.cloneNode(true) as HTMLElement;
            cloned.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
            cloned.querySelectorAll('p').forEach(p => p.append('\n'));

            const rawText = cloned.innerText;
            const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 2);
            
            // Lọc các dòng rác (Copyright, Link web...)
            const cleanLines = lines.filter(l => {
                const lower = l.toLowerCase();
                if (JUNK_PHRASES.some(j => lower.includes(j))) return false;
                if (lower === title.toLowerCase()) return false;
                return true;
            });

            let finalContent = cleanScrapedText(cleanLines.join('\n\n'));

            // 4. TÌM LINK TRANG TIẾP THEO (Pagination / Phân trang)
            let innerNextPageUrl: string | null = null;
            let realNextChapterUrl: string | null = null;

            const allLinks = Array.from(doc.querySelectorAll('a'));
            for (const link of allLinks) {
                const text = link.innerText.trim().toLowerCase();
                const href = link.getAttribute('href');
                if (!href || href.startsWith('javascript') || href === '#') continue;

                const fullHref = resolveUrl(cleanUrl, href);

                // Piaotia thường có "下一页" cho trang 2 của cùng 1 chương
                if (PAGINATION_KEYWORDS.some(kw => text.includes(kw) && text.length < 10)) {
                    // Nếu link có dạng _2.html hoặc gần giống link hiện tại -> Trang tiếp của chương
                    if (fullHref.includes('_') || fullHref.length === cleanUrl.length) {
                         innerNextPageUrl = fullHref;
                    }
                }

                // Link chương thực sự tiếp theo
                if (text.includes("下一章") || text.includes("next chapter") || text.includes("chương sau") || text === ">>") {
                    realNextChapterUrl = fullHref;
                }
            }

            // Xử lý đệ quy nếu có trang tiếp theo (gộp nội dung)
            if (innerNextPageUrl && innerNextPageUrl !== cleanUrl && !isPaginationCall) {
                try {
                    // Chờ một chút để tránh rate limit proxy
                    await new Promise(r => setTimeout(r, 500));
                    const nextPageData = await fetchContentFromUrl(innerNextPageUrl, true);
                    finalContent += "\n\n" + nextPageData.content;
                    // Lấy nextUrl từ trang cuối cùng
                    realNextChapterUrl = nextPageData.nextUrl || realNextChapterUrl;
                } catch (e) {
                    console.warn("Lỗi cào pagination:", e);
                }
            }

            if (finalContent.length < 100) {
                lastError = "Nội dung cào được quá ngắn. Có thể do Proxy bị chặn hoặc cấu trúc trang thay đổi.";
                continue;
            }

            return { title, content: finalContent, nextUrl: realNextChapterUrl };
        } catch (e: any) {
            lastError = `Lỗi Proxy ${proxyBase}: ${e.message}`;
        }
    }
    throw new Error(lastError || "Không thể tải nội dung từ URL này.");
};

export const unzipFiles = async (file: File, startOrder: number = 0): Promise<FileItem[]> => {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);
  const files: FileItem[] = [];
  const filePaths = Object.keys(loadedZip.files).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  let currentOrder = startOrder;
  for (const path of filePaths) {
    const entry = loadedZip.files[path];
    if (!entry.dir && path.toLowerCase().endsWith('.txt')) {
      const content = await entry.async('string');
      files.push({ id: crypto.randomUUID(), name: translateChapterTitle(path.split('/').pop() || path), orderIndex: currentOrder++, content, translatedContent: null, status: FileStatus.IDLE, retryCount: 0, originalCharCount: content.length, remainingRawCharCount: 0 });
    }
  }
  return files;
};

export const createMergedFile = (files: FileItem[]) => [...files].sort((a,b)=>a.orderIndex-b.orderIndex).filter(f=>f.status===FileStatus.COMPLETED).map(f=>`### ${f.name}\n\n${f.translatedContent}`).join('\n\n');

export const downloadTextFile = (name:string, content:string) => {
  const blob = new Blob([content], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
};

export const generateEpub = async (files: FileItem[], story: StoryInfo): Promise<Blob> => {
    const zip = new JSZip();
    zip.file("mimetype", "application/epub+zip", {compression:"STORE"});
    const oebps = zip.folder("OEBPS");
    if (!oebps) throw new Error("Could not create OEBPS folder");

    oebps.file("Styles/style.css", `body { font-family: serif; line-height: 1.6; padding: 5%; } h2 { text-align: center; } p { text-indent: 1em; margin: 0.5em 0; }`);
    
    let manifest = "";
    let spine = "";
    const sorted = [...files].sort((a,b)=>a.orderIndex-b.orderIndex).filter(f=>f.status===FileStatus.COMPLETED);

    sorted.forEach((f, i) => {
        const id = `ch${i+1}`;
        const xhtml = `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${f.name}</title><link href="../Styles/style.css" rel="stylesheet" type="text/css"/></head>
<body><h2>${f.name}</h2>${(f.translatedContent||'').split('\n').filter(l=>l.trim()).map(l=>`<p>${l.trim()}</p>`).join('')}</body></html>`;
        oebps.file(`Text/${id}.xhtml`, xhtml);
        manifest += `<item id="${id}" href="Text/${id}.xhtml" media-type="application/xhtml+xml"/>\n`;
        spine += `<itemref idref="${id}"/>\n`;
    });

    oebps.file("content.opf", `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${story.title}</dc:title><dc:creator>${story.author}</dc:creator><dc:language>vi</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\..+$/, "Z")}</meta></metadata>
<manifest><item id="css" href="Styles/style.css" media-type="text/css"/>${manifest}</manifest>
<spine>${spine}</spine></package>`);

    zip.folder("META-INF")?.file("container.xml", `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);

    return await zip.generateAsync({type:"blob"});
};
