# 📋 MÔ TẢ CHI TIẾT DỰ ÁN RAG CHATBOT

## 🎯 TỔNG QUAN DỰ ÁN

Dự án là một **ứng dụng chatbot RAG (Retrieval-Augmented Generation)** cho phép người dùng:
- Upload và xử lý file PDF
- Hỏi đáp về nội dung tài liệu PDF thông qua chatbot
- Sử dụng giao diện web hiện đại hoặc CLI

**Công nghệ sử dụng:**
- **Backend:** Flask (Python)
- **RAG Framework:** LangChain
- **Vector Database:** FAISS hoặc ChromaDB
- **Embedding Model:** HuggingFace (sentence-transformers)
- **LLM:** Groq API (Llama 3.1 8B Instant)
- **Frontend:** HTML/CSS/JavaScript

---

## 📁 CẤU TRÚC FILE VÀ CHỨC NĂNG

### 1. **appchatbot.py** - Flask Web Application
**Vai trò:** File chính chạy web server, xử lý HTTP requests từ frontend

#### Các chức năng chính:

##### 1.1. Khởi tạo ứng dụng (dòng 18-67)
- Tạo Flask app với CORS support
- Cấu hình thư mục: `uploads/`, `data/`, `faiss_index/`, `chroma_db/`
- Tự động khởi tạo RAG system nếu có PDF trong `data/`
- Thiết lập các tham số: `K=5`, `SCORE_THRESHOLD=0.2`

##### 1.2. Route `/` (dòng 69-72)
- **Chức năng:** Trả về trang chủ (index.html)
- **Luồng:** Browser request → Flask render template → Trả về HTML

##### 1.3. Route `/api/status` (dòng 80-87)
- **Chức năng:** Kiểm tra trạng thái RAG system
- **Request:** GET
- **Response:** JSON với `initialized`, `data_folder`, `vectorstore_type`
- **Luồng:** 
  ```
  Frontend → GET /api/status → rag_service.is_initialized() → JSON response
  ```

##### 1.4. Route `/api/chat` (dòng 89-143)
- **Chức năng:** Xử lý câu hỏi từ người dùng và trả về câu trả lời
- **Request:** POST với JSON `{"message": "câu hỏi"}`
- **Response:** JSON với `{"reply": "câu trả lời", "status": "success"}`
- **Luồng xử lý:**
  ```
  1. Frontend gửi POST /api/chat với JSON body
  2. Flask validate request (kiểm tra Content-Type, message không rỗng)
  3. Kiểm tra RAG system đã khởi tạo chưa (is_initialized())
  4. Gọi rag_service.ask_rag(user_message)
  5. RAG system xử lý và trả về câu trả lời
  6. Flask trả về JSON response cho frontend
  ```
- **Xử lý lỗi:** Trả về JSON error với status code phù hợp (400, 503, 500)

##### 1.5. Route `/api/upload` (dòng 145-282)
- **Chức năng:** Upload và xử lý file PDF
- **Request:** POST với FormData chứa file PDF
- **Response:** JSON với `{"status": "success", "filename": "...", "message": "..."}`
- **Luồng xử lý chi tiết:**
  ```
  1. Frontend gửi POST /api/upload với FormData (file PDF)
  2. Flask validate file (kiểm tra có file, tên file, extension .pdf)
  3. Làm sạch filename (loại bỏ ký tự đặc biệt)
  4. Lưu file vào thư mục uploads/
  5. Copy file vào thư mục data/
  6. Kiểm tra RAG system:
     - Nếu chưa khởi tạo → gọi initialize_rag()
     - Nếu đã khởi tạo → gọi add_document_to_vectorstore()
       - Nếu thêm thành công → OK
       - Nếu thất bại → xóa index cũ và khởi tạo lại
  7. Trả về JSON response với kết quả
  ```

##### 1.6. Route `/api/reinitialize` (dòng 284-313)
- **Chức năng:** Khởi tạo lại RAG system (sau khi thêm/xóa file thủ công)
- **Request:** POST
- **Luồng:**
  ```
  1. Xóa index cũ (faiss_index/ hoặc chroma_db/)
  2. Gọi initialize_rag() để tạo lại từ tất cả PDF trong data/
  3. Trả về JSON response
  ```

##### 1.7. Error Handlers (dòng 315-349)
- Xử lý các lỗi HTTP (404, 405, 500) và trả về JSON
- Đảm bảo tất cả response đều là JSON format

---

### 2. **rag_service.py** - RAG Service Module
**Vai trò:** Module chứa logic RAG, có thể tái sử dụng cho web app và CLI

#### Các biến global (dòng 43-52):
- `_embeddings`: Cache embedding model (singleton)
- `_vectorstore`: Vector database instance
- `_rag_chain`: RAG processing chain
- Các biến cấu hình: `_vectorstore_type`, `_data_path`, `_k`, `_score_threshold`

#### Các hàm chính:

##### 2.1. `get_embeddings()` (dòng 54-81)
- **Chức năng:** Lấy hoặc tạo embedding model (singleton pattern)
- **Model:** `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`
- **Luồng:**
  ```
  1. Kiểm tra _embeddings đã tồn tại chưa
  2. Nếu chưa → tạo HuggingFaceEmbeddings với model đa ngôn ngữ
  3. Cache vào _embeddings và trả về
  ```

##### 2.2. `format_docs(docs)` (dòng 83-85)
- **Chức năng:** Format danh sách documents thành chuỗi text
- **Input:** List of Document objects
- **Output:** String (ghép page_content của các documents)

##### 2.3. `initialize_rag(...)` (dòng 87-224)
- **Chức năng:** Khởi tạo toàn bộ RAG system
- **Tham số:**
  - `vectorstore_type`: "faiss" hoặc "chroma"
  - `data_path`: Đường dẫn thư mục chứa PDF
  - `faiss_dir`, `chroma_dir`: Thư mục lưu vectorstore
  - `k`: Số documents để retrieve
  - `score_threshold`: Ngưỡng similarity
- **Luồng xử lý chi tiết:**
  ```
  1. Lưu các tham số vào global variables
  2. Lấy embedding model (get_embeddings())
  3. Load PDF documents:
     - Sử dụng DirectoryLoader với UnstructuredFileLoader
     - Load tất cả file .pdf trong data_path
  4. Split documents:
     - Sử dụng RecursiveCharacterTextSplitter
     - chunk_size=1200, chunk_overlap=200
     - Separators theo markdown format
  5. Build/Load Vectorstore:
     - FAISS:
       * Nếu index đã tồn tại → load từ disk
       * Nếu chưa → tạo mới từ documents và save
     - Chroma:
       * Nếu DB đã tồn tại → load từ persist_directory
       * Nếu chưa → tạo mới và persist
  6. Tạo Retriever:
     - search_type="similarity_score_threshold"
     - search_kwargs: k và score_threshold
  7. Tạo Prompt Template:
     - Hướng dẫn LLM chỉ dùng ngữ liệu được cung cấp
     - Không sử dụng kiến thức bên ngoài
  8. Khởi tạo LLM (ChatGroq):
     - Model: llama-3.1-8b-instant
     - API key từ .env (GROQ_API_KEY)
     - temperature=0.1, max_tokens=512
  9. Tạo RAG Chain:
     - RunnableParallel: context (retriever) + question
     - Format docs → Prompt → LLM → StrOutputParser
  10. Lưu chain vào _rag_chain và trả về True
  ```

##### 2.4. `add_document_to_vectorstore(file_path, ...)` (dòng 226-260)
- **Chức năng:** Thêm một document mới vào vectorstore hiện có
- **Luồng:**
  ```
  1. Kiểm tra _vectorstore đã khởi tạo chưa
  2. Load document từ file_path (UnstructuredFileLoader)
  3. Split document thành chunks
  4. Thêm vào vectorstore:
     - FAISS: add_documents() → save_local()
     - Chroma: add_documents() → persist()
  5. Trả về True
  ```

##### 2.5. `ask_rag(question)` (dòng 262-281)
- **Chức năng:** Xử lý câu hỏi và trả về câu trả lời
- **Input:** String (câu hỏi)
- **Output:** String (câu trả lời)
- **Luồng xử lý:**
  ```
  1. Kiểm tra _rag_chain đã khởi tạo chưa
  2. Gọi _rag_chain.invoke(question):
     a. Retriever tìm k documents tương tự nhất (dựa trên embedding similarity)
     b. Format documents thành context string
     c. Đưa context + question vào prompt template
     d. LLM (Groq) xử lý và sinh câu trả lời
     e. Parse output thành string
  3. Trả về câu trả lời (hoặc error message nếu có lỗi)
  ```

##### 2.6. `is_initialized()` (dòng 283-285)
- **Chức năng:** Kiểm tra RAG system đã khởi tạo chưa
- **Return:** Boolean

---

### 3. **chatbotrag.py** - CLI Version
**Vai trò:** Phiên bản command-line của RAG chatbot

#### Các chức năng:

##### 3.1. `get_args()` (dòng 19-27)
- **Chức năng:** Parse command-line arguments
- **Tham số:** input_data, vectorstores, persist_dir, faiss_dir, k, score_threshold

##### 3.2. `rag_chatbot(args)` (dòng 33-159)
- **Chức năng:** Main function chạy chatbot CLI
- **Luồng:**
  ```
  1. Load PDF documents từ input_data
  2. Split documents
  3. Khởi tạo embeddings (HuggingFace, model tiếng Việt)
  4. Build/Load vectorstore (FAISS hoặc Chroma)
  5. Tạo retriever
  6. Tạo prompt template
  7. Khởi tạo LLM (ChatGroq)
  8. Tạo RAG chain
  9. Chat loop:
     - Nhận input từ user
     - Gọi rag_chain.invoke()
     - In kết quả
     - Lặp lại cho đến khi user nhập "exit"
  ```

**Khác biệt với web version:**
- Sử dụng model embedding tiếng Việt: `keepitreal/vietnamese-sbert`
- Không có global cache (mỗi lần chạy khởi tạo mới)
- Tương tác qua terminal thay vì web interface

---

### 4. **templates/index.html** - Frontend Interface
**Vai trò:** Giao diện web cho người dùng

#### Các chức năng chính:

##### 4.1. UI Components:
- **Chat container:** Hiển thị tin nhắn giữa user và bot
- **File upload area:** Drag & drop hoặc click để upload PDF
- **Input area:** Textarea để nhập câu hỏi
- **History panel:** Lịch sử chat (lưu trong localStorage)
- **Theme toggle:** Dark/Light mode

##### 4.2. JavaScript Functions:

**`checkStatus()` (dòng 486-517):**
- Gọi GET `/api/status` khi trang load
- Hiển thị trạng thái hệ thống

**`handlePDF(file)` (dòng 551-599):**
- Upload file PDF qua POST `/api/upload`
- Hiển thị progress và kết quả
- Cập nhật UI khi upload thành công

**`sendMessage()` (dòng 610-684):**
- Gửi câu hỏi qua POST `/api/chat`
- Hiển thị typing indicator
- Nhận và hiển thị câu trả lời
- Lưu vào chat history

**`addMessage(sender, text)` (dòng 686-696):**
- Tạo và hiển thị message bubble
- Auto scroll đến message mới

**`saveToHistory()` (dòng 698-708):**
- Lưu message vào localStorage
- Cập nhật history panel

**`renderHistory()` (dòng 710-736):**
- Hiển thị danh sách các session chat
- Group theo sessionId

**`loadSession(sessionId)` (dòng 738-754):**
- Tải lại một session chat cũ
- Hiển thị lại toàn bộ messages trong session

---

### 5. **test_imports.py** - Testing Script
**Vai trò:** Kiểm tra các dependencies có được cài đặt đúng không

**Chức năng:**
- Test import các package: sentence-transformers, HuggingFaceEmbeddings, ChatGroq, FAISS, UnstructuredFileLoader
- Test khởi tạo HuggingFaceEmbeddings
- In kết quả OK/FAIL cho từng test

---

## 🔄 LUỒNG XỬ LÝ TỔNG THỂ

### Luồng 1: Khởi động ứng dụng

```
1. User chạy: python appchatbot.py
   ↓
2. Flask app khởi tạo
   ↓
3. Kiểm tra thư mục data/ có PDF không?
   ├─ Có → Gọi rag_service.initialize_rag()
   │         ↓
   │         Load PDF → Split → Embed → Build Vectorstore → Tạo RAG Chain
   │         ↓
   │         RAG system sẵn sàng
   └─ Không → In thông báo, chờ upload PDF
   ↓
4. Flask server chạy trên port 5000
   ↓
5. User mở browser → http://localhost:5000
   ↓
6. Frontend gọi GET /api/status
   ↓
7. Hiển thị trạng thái hệ thống
```

### Luồng 2: Upload PDF và xử lý

```
1. User chọn file PDF trong browser
   ↓
2. Frontend: handlePDF() → POST /api/upload với FormData
   ↓
3. Flask: Route /api/upload
   ├─ Validate file (kiểm tra extension, tên file)
   ├─ Lưu vào uploads/
   ├─ Copy vào data/
   ↓
4. Kiểm tra RAG system:
   ├─ Chưa khởi tạo:
   │   └─ Gọi rag_service.initialize_rag()
   │       ↓
   │       Load tất cả PDF trong data/
   │       ↓
   │       Split → Embed → Build Vectorstore
   │       ↓
   │       Tạo RAG Chain
   │
   └─ Đã khởi tạo:
       └─ Gọi rag_service.add_document_to_vectorstore()
           ↓
           Load PDF mới → Split → Add to vectorstore
           ↓
           Save vectorstore
   ↓
5. Trả về JSON response: {"status": "success", ...}
   ↓
6. Frontend hiển thị thông báo thành công
```

### Luồng 3: Chat với bot (RAG Query)

```
1. User nhập câu hỏi và nhấn Send
   ↓
2. Frontend: sendMessage() → POST /api/chat với JSON {"message": "..."}
   ↓
3. Flask: Route /api/chat
   ├─ Validate request (JSON format, message không rỗng)
   ├─ Kiểm tra RAG system đã khởi tạo
   ↓
4. Gọi rag_service.ask_rag(user_message)
   ↓
5. RAG Processing (trong rag_service.py):
   ├─ _rag_chain.invoke(question)
   │   ↓
   │   a. Retriever.search(question):
   │      - Embed question (dùng embedding model)
   │      - Tìm k documents tương tự nhất trong vectorstore
   │      - Filter theo score_threshold
   │      ↓
   │   b. format_docs(docs):
   │      - Ghép page_content của các documents thành context
   │      ↓
   │   c. Prompt template:
   │      - Đưa context + question vào template
   │      ↓
   │   d. LLM (ChatGroq):
   │      - Gửi prompt đến Groq API
   │      - LLM sinh câu trả lời dựa trên context
   │      ↓
   │   e. StrOutputParser:
   │      - Parse output thành string
   │      ↓
   │   f. Trả về câu trả lời
   ↓
6. Flask nhận câu trả lời
   ↓
7. Trả về JSON: {"reply": "...", "status": "success"}
   ↓
8. Frontend hiển thị câu trả lời trong chat
   ↓
9. Lưu vào chat history (localStorage)
```

### Luồng 4: Reinitialize RAG System

```
1. User gọi POST /api/reinitialize (hoặc thêm/xóa file thủ công)
   ↓
2. Flask: Route /api/reinitialize
   ├─ Xóa index cũ (faiss_index/ hoặc chroma_db/)
   ↓
3. Gọi rag_service.initialize_rag()
   ↓
4. Load lại tất cả PDF trong data/
   ↓
5. Tạo lại vectorstore từ đầu
   ↓
6. Tạo lại RAG chain
   ↓
7. Trả về JSON response
```

---

## 🔗 QUAN HỆ GIỮA CÁC FILE

```
┌─────────────────┐
│  index.html     │  (Frontend)
│  (templates/)   │
└────────┬────────┘
         │ HTTP Requests (GET/POST)
         ↓
┌─────────────────┐
│ appchatbot.py   │  (Flask Web Server)
│                 │
│  - Routes       │
│  - Validation   │
│  - Error Handle │
└────────┬────────┘
         │ Function Calls
         ↓
┌─────────────────┐
│ rag_service.py  │  (RAG Core Logic)
│                 │
│  - initialize   │
│  - ask_rag      │
│  - add_doc      │
└────────┬────────┘
         │ Uses
         ↓
┌─────────────────────────────────────┐
│  External Libraries                 │
│  - LangChain (RAG framework)        │
│  - FAISS/Chroma (Vector DB)         │
│  - HuggingFace (Embeddings)         │
│  - Groq API (LLM)                   │
│  - Unstructured (PDF loader)        │
└─────────────────────────────────────┘

┌─────────────────┐
│ chatbotrag.py   │  (CLI Version)
│                 │  (Standalone, không dùng rag_service)
└─────────────────┘
```

---

## 📊 CẤU TRÚC DỮ LIỆU

### Vectorstore Structure:
- **FAISS:** Lưu trong `faiss_index/` (index.faiss, index.pkl)
- **Chroma:** Lưu trong `chroma_db/` (SQLite database)

### Document Structure (sau khi split):
```python
Document(
    page_content="...",  # Text content của chunk
    metadata={
        "source": "path/to/file.pdf",
        "page": 1,
        "start_index": 0
    }
)
```

### Chat History (localStorage):
```json
[
  {
    "sessionId": "1234567890",
    "sender": "user",
    "text": "Câu hỏi...",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "pdf": "document.pdf"
  },
  {
    "sessionId": "1234567890",
    "sender": "bot",
    "text": "Câu trả lời...",
    "timestamp": "2024-01-01T00:00:01.000Z",
    "pdf": "document.pdf"
  }
]
```

---

## ⚙️ CẤU HÌNH VÀ THAM SỐ

### Cấu hình trong appchatbot.py:
- `VECTORSTORE_TYPE`: "faiss" hoặc "chroma"
- `K`: Số documents để retrieve (mặc định: 5)
- `SCORE_THRESHOLD`: Ngưỡng similarity (mặc định: 0.2)
- `UPLOAD_FOLDER`: "uploads"
- `DATA_FOLDER`: "data"

### Cấu hình trong rag_service.py:
- `chunk_size`: 1200 ký tự
- `chunk_overlap`: 200 ký tự
- `embedding_model`: "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
- `llm_model`: "llama-3.1-8b-instant"
- `temperature`: 0.1
- `max_tokens`: 512

### Environment Variables (.env):
- `GROQ_API_KEY`: API key cho Groq service

---

## 🔐 BẢO MẬT VÀ XỬ LÝ LỖI

### Validation:
- File upload: Kiểm tra extension .pdf, tên file hợp lệ
- Chat request: Kiểm tra JSON format, message không rỗng
- Filename sanitization: Loại bỏ ký tự đặc biệt

### Error Handling:
- Tất cả routes trả về JSON (kể cả lỗi)
- Error handlers cho 404, 405, 500
- Try-catch trong các hàm xử lý
- Logging lỗi ra console

### CORS:
- Hỗ trợ CORS nếu flask-cors được cài đặt
- Cho phép cross-origin requests

---

## 📝 TÓM TẮT CÁC CHỨC NĂNG CHÍNH

1. **Upload PDF:** Người dùng có thể upload file PDF qua web interface
2. **Xử lý PDF:** Tự động load, split, embed và lưu vào vectorstore
3. **Chat với bot:** Hỏi đáp về nội dung PDF sử dụng RAG
4. **Lịch sử chat:** Lưu và quản lý lịch sử chat trong browser
5. **Dark/Light mode:** Chuyển đổi theme giao diện
6. **Reinitialize:** Khởi tạo lại hệ thống sau khi thay đổi files
7. **CLI version:** Sử dụng chatbot qua command-line

---

## 🎯 ĐIỂM MẠNH VÀ ĐẶC ĐIỂM

### Điểm mạnh:
- ✅ Tách biệt rõ ràng giữa web interface và RAG logic
- ✅ Hỗ trợ cả FAISS và ChromaDB
- ✅ Có thể thêm document mới mà không cần rebuild toàn bộ
- ✅ Error handling tốt, luôn trả về JSON
- ✅ Giao diện web hiện đại, responsive
- ✅ Hỗ trợ tiếng Việt

### Đặc điểm kỹ thuật:
- Singleton pattern cho embeddings (tiết kiệm memory)
- Global cache cho vectorstore và RAG chain
- Automatic retry khi không thể thêm document (fallback về reinitialize)
- Filename sanitization để tránh lỗi filesystem

---

**Tài liệu này mô tả chính xác toàn bộ dự án dựa trên code hiện tại.**

