# ⚡ QUICK START - Chạy nhanh trong 3 bước

## Bước 1: Cài đặt dependencies

```powershell
pip install -r requirements.txt
pip install "unstructured[pdf]"
```

## Bước 2: Tạo file `.env`

Tạo file `.env` trong thư mục gốc với nội dung:

```
GROQ_API_KEY=gsk_your_api_key_here
```

**Lấy API key tại:** https://console.groq.com/

## Bước 3: Chạy ứng dụng

### Cách 1: Dùng script (Windows)

Double-click file `run.bat`

### Cách 2: Chạy thủ công

```powershell
python appchatbot.py
```

### Cách 3: Dùng Python trực tiếp

```powershell
python -m flask run
```

## Mở trình duyệt

Truy cập: **http://localhost:5000**

## ✅ Kiểm tra

1. ✅ App chạy không có lỗi
2. ✅ Browser mở được trang web
3. ✅ Upload PDF thành công
4. ✅ Chat bot trả lời được

## ❌ Nếu gặp lỗi

### Lỗi: ModuleNotFoundError
```powershell
pip install -r requirements.txt
```

### Lỗi: GROQ_API_KEY not found
- Kiểm tra file `.env` có đúng tên không
- Kiểm tra API key có hợp lệ không

### Lỗi: RAG system chưa khởi tạo
- Upload PDF qua giao diện web
- Hoặc copy PDF vào thư mục `data/` và restart app

---

**Chi tiết hơn:** Xem file `HUONG_DAN_CHAY.md`

