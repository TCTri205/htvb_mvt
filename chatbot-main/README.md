# RAG Chatbot Web Application

Ứng dụng web chatbot sử dụng RAG (Retrieval-Augmented Generation) để trả lời câu hỏi dựa trên tài liệu PDF.

## Tính năng

- ✅ Upload và xử lý file PDF
- ✅ Chat với RAG system để hỏi đáp về nội dung PDF
- ✅ Giao diện web hiện đại, responsive
- ✅ Lịch sử chat (lưu trong localStorage)
- ✅ Dark mode / Light mode
- ✅ Hỗ trợ tiếng Việt

## Cài đặt

### 1. Cài đặt dependencies

```bash
pip install -r requirements.txt
```

### 2. Cài đặt dependencies cho PDF processing

```bash
pip install "unstructured[pdf]"
```

### 3. Cấu hình môi trường

Tạo file `.env` trong thư mục gốc:

```
GROQ_API_KEY=your_groq_api_key_here
```

Lấy API key tại: https://console.groq.com/

### 4. Chuẩn bị thư mục

Thư mục sẽ được tạo tự động:
- `data/` - Chứa file PDF
- `uploads/` - File upload tạm
- `faiss_index/` hoặc `chroma_db/` - Vectorstore index

## Sử dụng

### Chạy ứng dụng web

```bash
python appchatbot.py
```

Sau đó mở trình duyệt và truy cập: http://localhost:5000

### Chạy CLI version

```bash
python chatbotrag.py
```

Hoặc với các tham số tùy chỉnh:

```bash
python chatbotrag.py --vectorstores faiss --k 10 --score_threshold 0.3
```

## Cấu trúc dự án

```
.
├── appchatbot.py          # Flask web application
├── chatbotrag.py          # CLI version
├── rag_service.py          # RAG service module (tái sử dụng)
├── requirements.txt        # Python dependencies
├── templates/
│   └── index.html         # Giao diện web
├── data/                  # Thư mục chứa PDF
├── uploads/               # Thư mục upload tạm
├── faiss_index/          # FAISS vectorstore
└── chroma_db/           # Chroma vectorstore
```

## API Endpoints

### GET `/api/status`
Kiểm tra trạng thái RAG system

### POST `/api/chat`
Gửi câu hỏi và nhận câu trả lời

**Request:**
```json
{
  "message": "Nội dung chính của tài liệu là gì?"
}
```

**Response:**
```json
{
  "status": "success",
  "reply": "Câu trả lời từ RAG system..."
}
```

### POST `/api/upload`
Upload file PDF

**Request:** Form data với field `pdf`

**Response:**
```json
{
  "status": "success",
  "filename": "document.pdf",
  "message": "Đã upload và xử lý file thành công"
}
```

### POST `/api/reinitialize`
Khởi tạo lại RAG system (sau khi thêm/xóa file)

## Cấu hình

Trong `appchatbot.py`, bạn có thể thay đổi:

```python
VECTORSTORE_TYPE = "faiss"  # hoặc "chroma"
K = 5                       # Số lượng documents để retrieve
SCORE_THRESHOLD = 0.2       # Ngưỡng điểm similarity
```

## Lưu ý

- Lần đầu chạy sẽ mất thời gian để tải model embedding và xử lý PDF
- Model embedding mặc định: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`
- LLM mặc định: `llama-3.1-8b-instant` (Groq)
- Có thể thay đổi model embedding trong `rag_service.py`

## Troubleshooting

### Lỗi "ModuleNotFoundError"
Cài đặt lại dependencies:
```bash
pip install -r requirements.txt
```

### Lỗi khi xử lý PDF
Đảm bảo đã cài đặt:
```bash
pip install "unstructured[pdf]"
```

### Lỗi "GROQ_API_KEY not found"
Kiểm tra file `.env` có đúng format và API key hợp lệ.

### Vectorstore không tương thích
Xóa thư mục `faiss_index/` hoặc `chroma_db/` và chạy lại để tạo index mới.

## License

MIT

