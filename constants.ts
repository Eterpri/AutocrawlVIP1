
import { ModelQuota } from './utils/types';

export const PROMPT_PRESETS = [
    {
        name: "Mặc định (Dịch Sát Nghĩa & Đầy ĐỦ)",
        content: `MỤC TIÊU: Dịch thuật nội dung truyện từ bản convert/tiếng Trung sang tiếng Việt một cách TRUNG THỰC, SÁT NGHĨA và ĐẦY ĐỦ 100%.

**YÊU CẦU CỐT LÕI:**
1. **Dịch không sót:** Không được tự ý tóm tắt hoặc bỏ qua bất kỳ đoạn văn nào. Mỗi dòng trong nguyên tác đều phải có dòng tương ứng trong bản dịch.
2. **Sát nghĩa:** Ưu tiên truyền tải đúng ý nghĩa của tác giả. Không tự ý thêm thắt các tình tiết hoa mỹ không có trong gốc trừ khi cần thiết để câu văn trôi chảy.
3. **Văn phong:** Sử dụng từ ngữ thuần Việt, mượt mà, phù hợp với thể loại truyện.
4. **Xưng hô:** Nhất quán theo bảng từ điển và bối cảnh nhân vật.
5. **Tiêu đề:** Đặt theo định dạng "Chương [Số]: [Tên chương]". Tên chương phải dịch sát với nghĩa gốc.

**THÔNG TIN TRUYỆN:**
- Tên: [{{TITLE}}]
- Thể loại: [{{GENRE}}]
- Tính cách Main: [{{PERSONALITY}}]
- Bối cảnh: [{{SETTING}}]

**QUY TẮC TRÌNH BÀY:**
- Trả về duy nhất nội dung truyện đã dịch.
- Không thêm bất kỳ lời bình luận hay chú thích nào của AI.
- Chia đoạn rõ ràng theo cấu trúc của nguyên tác.
`
    },
    {
        name: "Tiên Hiệp (Hoa Mỹ)",
        content: `PROMPT DỊCH TIÊN HIỆP - HUYỀN HUYỄN (HOA MỸ)

VAI TRÒ: Dịch giả chuyên dòng Tiên Hiệp, Huyền Huyễn.

YÊU CẦU:
1. Sử dụng nhiều từ Hán Việt trang trọng để tạo không khí cổ kính, hào hùng.
2. Xưng hô: Ta - Ngươi, Lão phu, Bổn tọa, Các hạ... theo đúng tôn ti trật tự trong truyện.
3. Giữ nguyên tên chiêu thức, pháp bảo, cảnh giới ở dạng Hán Việt.
4. KHÔNG ĐƯỢC BỎ SÓT NỘI DUNG. Dịch đầy đủ từng câu, từng chữ.
`
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
