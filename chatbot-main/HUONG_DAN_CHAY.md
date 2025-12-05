# 🚀 HƯỚNG DẪN CHẠY ỨNG DỤNG RAG CHATBOT

## Bước 1: Kiểm tra và cài đặt dependencies

### 1.1. Cài đặt các package Python cơ bản

Mở PowerShell hoặc Command Prompt trong thư mục dự án và chạy:

```powershell
pip install -r requirements.txt
```

### 1.2. Cài đặt dependencies cho PDF processing

```powershell
pip install "unstructured[pdf]"
```

**Lưu ý:** Lần đầu cài có thể mất 5-10 phút vì cần tải nhiều package (torch, transformers, v.v.)

## Bước 2: Cấu hình môi trường

### 2.1. Tạo file `.env`

Tạo file `.env` trong thư mục gốc (cùng cấp với `appchatbot.py`) với nội dung:

```
GROQ_API_KEY=your_groq_api_key_here
```

### 2.2. Lấy GROQ API Key

1. Truy cập: https://console.groq.com/
2. Đăng ký/Đăng nhập
3. Vào phần "API Keys"
4. Tạo API key mới
5. Copy và paste vào file `.env`

**Ví dụ file `.env`:**
```
GROQ_API_KEY=gsk_1234567890abcdefghijklmnopqrstuvwxyz
```

## Bước 3: Chuẩn bị dữ liệu (tùy chọn)

### 3.1. Kiểm tra thư mục `data/`

- Đảm bảo có ít nhất 1 file PDF trong thư mục `data/`
- File PDF sẽ được tự động load khi khởi động app

### 3.2. Nếu chưa có PDF

Bạn có thể:
- Copy file PDF vào thư mục `data/`
- Hoặc upload qua giao diện web sau khi app đã chạy

## Bước 4: Chạy ứng dụng

### 4.1. Chạy Flask app

Trong PowerShell/Command Prompt:

```powershell
python appchatbot.py
```

### 4.2. Kết quả mong đợi

Bạn sẽ thấy output như sau:

```
🚀 Starting Flask app...
📁 Data folder: ./data
📁 Upload folder: ./uploads
🔍 Vectorstore type: faiss
✅ RAG system đã được khởi tạo thành công!
 * Running on http://127.0.0.1:5000
 * Running on http://0.0.0.0:5000
```

**Lưu ý:**
- Lần đầu chạy sẽ mất thời gian để:
  - Tải model embedding (có thể 2-5 phút)
  - Xử lý PDF và tạo vectorstore (tùy kích thước PDF)
- Các lần chạy sau sẽ nhanh hơn vì đã có index sẵn

## Bước 5: Sử dụng ứng dụng

### 5.1. Mở trình duyệt

Truy cập: **http://localhost:5000** hoặc **http://127.0.0.1:5000**

### 5.2. Upload PDF (nếu chưa có)

1. Click vào vùng "Kéo & thả hoặc click để upload PDF"
2. Chọn file PDF từ máy tính
3. Đợi hệ thống xử lý (có thể mất 1-3 phút tùy kích thước file)
4. Khi thấy thông báo "Đã upload và xử lý file..." là thành công

### 5.3. Chat với bot

1. Nhập câu hỏi vào ô input ở dưới
2. Nhấn Enter hoặc click nút Send
3. Đợi bot trả lời (có thể mất 5-15 giây)
4. Tiếp tục hỏi các câu hỏi khác

**Ví dụ câu hỏi:**
- "Nội dung chính của tài liệu là gì?"
- "Tóm tắt tài liệu"
- "Giải thích chi tiết về [chủ đề]"
- "Có những phần nào trong tài liệu?"

## Bước 6: Kiểm tra và xử lý lỗi

### 6.1. Lỗi thường gặp

#### Lỗi: "ModuleNotFoundError"
**Giải pháp:**
```powershell
pip install -r requirements.txt
pip install "unstructured[pdf]"
```

#### Lỗi: "GROQ_API_KEY not found"
**Giải pháp:**
- Kiểm tra file `.env` có đúng tên và vị trí không
- Kiểm tra API key có hợp lệ không
- Đảm bảo không có khoảng trắng thừa trong file `.env`

#### Lỗi: "RAG system chưa được khởi tạo"
**Giải pháp:**
- Upload file PDF qua giao diện web
- Hoặc đảm bảo có file PDF trong thư mục `data/` và restart app

#### Lỗi khi xử lý PDF
**Giải pháp:**
```powershell
pip install "unstructured[pdf]"
```

### 6.2. Xem log chi tiết

Kiểm tra console/terminal nơi chạy `appchatbot.py` để xem:
- Lỗi cụ thể
- Quá trình xử lý PDF
- Thông báo từ RAG system

## Bước 7: Dừng ứng dụng

Nhấn `Ctrl + C` trong terminal để dừng server.

## 📝 Lưu ý quan trọng

1. **Lần đầu chạy:** Có thể mất 5-10 phút để tải model và xử lý PDF
2. **API Key:** Cần GROQ API key hợp lệ (miễn phí tại groq.com)
3. **PDF:** File PDF càng lớn, thời gian xử lý càng lâu
4. **Internet:** Cần kết nối internet để:
   - Tải model embedding lần đầu
   - Gọi Groq API để chat

## 🎯 Quick Start (Tóm tắt)

```powershell
# 1. Cài đặt
pip install -r requirements.txt
pip install "unstructured[pdf]"

# 2. Tạo file .env với GROQ_API_KEY

# 3. Chạy app
python appchatbot.py

# 4. Mở browser: http://localhost:5000
```

## 🔧 Cấu hình nâng cao

Trong file `appchatbot.py`, bạn có thể thay đổi:

```python
VECTORSTORE_TYPE = "faiss"  # hoặc "chroma"
K = 5                       # Số documents để retrieve
SCORE_THRESHOLD = 0.2       # Ngưỡng similarity
```

Chúc bạn sử dụng thành công! 🎉

