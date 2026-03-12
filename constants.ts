
import { ModelQuota } from './utils/types';

export const PROMPT_PRESETS = [
    {
        name: "Mặc định (Tối ưu Quota)",
        content: `MỤC TIÊU: Dịch thuật Trung-Việt trung thực, sát nghĩa, đầy đủ.
YÊU CẦU:
1. Không bỏ sót: Dịch 100% nội dung.
2. Văn phong: Thuần Việt, mượt mà.
3. Xưng hô: Nhất quán theo bối cảnh.
4. Tiêu đề: "Chương [Số]: [Tên]".
TRÌNH BÀY: Chỉ trả về nội dung dịch, không thêm lời bình.`
    },
    {
        name: "Tiên Hiệp (Gọn)",
        content: `VAI TRÒ: Dịch giả Tiên Hiệp.
YÊU CẦU:
1. Dùng từ Hán Việt trang trọng.
2. Xưng hô: Ta - Ngươi, Lão phu... đúng tôn ti.
3. Giữ nguyên tên chiêu thức, pháp bảo Hán Việt.
4. Dịch đầy đủ 100%, không bỏ sót.`
    }
];

export const GLOSSARY_ANALYSIS_PROMPT = `**PROMPT: LẬP HỒ SƠ PHÂN TÍCH VĂN HỌC (SERIES BIBLE)**

**VAI TRÒ:** Bạn là một Nhà Phê Bình Văn Học và Chuyên Gia Ngữ học.
**NHIỆM VỤ:** Phân tích các chương mẫu và trích xuất thông tin để đảm bảo bản dịch nhất quán.

**YÊU CẦU ĐẦU RA (Markdown):**
---
### 1. PHÂN TÍCH VĂN PHONG
- Nhận diện giọng văn (Hài hước, bi tráng, u ám...).
- Đề xuất cách xưng hô chủ đạo.

### 2. TỪ ĐIỂN NHÂN VẬT & THUẬT NGỮ
- [Tên Gốc] = [Tên Dịch] (Giới tính, Xưng hô).
- [Thuật ngữ gốc] = [Nghĩa dịch chuẩn].

### 3. LƯU Ý ĐẶC BIỆT
- Các từ cần giữ nguyên.
- Các thói quen ngôn ngữ của tác giả cần chú ý.
---
`;

export const DEFAULT_PROMPT = PROMPT_PRESETS[0].content;

export const DEFAULT_DICTIONARY = `
# --- ĐẠI TỪ / XƯNG HÔ CƠ BẢN ---
大家伙儿=mọi người/tất cả mọi người
`;

export const MODEL_CONFIGS: ModelQuota[] = [
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3.0 Flash (Tốc độ & Hiệu quả)',
    rpmLimit: 15,
    rpdLimit: 1500,
    priority: 1,
    maxOutputTokens: 65536
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro (Chất lượng cao nhất)',
    rpmLimit: 2,
    rpdLimit: 50,
    priority: 2,
    maxOutputTokens: 65536
  },
  {
    id: 'gemini-3.1-flash-lite-preview',
    name: 'Gemini 3.1 Flash Lite (Tiết kiệm)',
    rpmLimit: 15,
    rpdLimit: 1500,
    priority: 3,
    maxOutputTokens: 65536
  }
];

export const AVAILABLE_LANGUAGES = ['Convert thô', 'Tiếng Trung', 'Tiếng Anh', 'Tiếng Hàn', 'Tiếng Nhật'];
export const AVAILABLE_GENRES = ['Tiên Hiệp', 'Huyền Huyễn', 'Đô Thị', 'Khoa Huyễn', 'Võng Du', 'Đồng Nhân', 'Kiếm Hiệp', 'Ngôn Tình', 'Dị Giới', 'Mạt Thế', 'Ngự Thú', 'Linh Dị', 'Hệ Thống', 'Xuyên Nhanh', 'Hài Hước'];
export const AVAILABLE_PERSONALITIES = ['Vô sỉ/Cợt nhả', 'Lạnh lùng/Sát phạt', 'Cẩn trọng/Vững vàng', 'Thông minh/Đa mưu', 'Nhiệt huyết/Trẻ trâu', 'Trầm ổn/Già dặn', 'Hài hước/Bựa', 'Tàn nhẫn/Hắc ám', 'Chính nghĩa/Thánh mẫu'];
export const AVAILABLE_SETTINGS = ['Trung Cổ/Cổ Đại', 'Hiện đại/Đô thị', 'Tương lai/Sci-fi', 'Mạt thế/Zombie', 'Hồng Hoang/Thần Thoại', 'Võng Du/Game', 'Phương Tây/Magic', 'Thanh Xuân/Vườn Trường', 'Showbiz/Giải Trí'];
export const AVAILABLE_FLOWS = ['Phàm nhân lưu', 'Vô địch lưu', 'Phế vật lưu', 'Hệ thống lưu', 'Xuyên không lưu', 'Trọng sinh lưu', 'Điền văn lưu', 'Vô hạn lưu', 'G苟 Đạo (Cẩu đạo)'];
