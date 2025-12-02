# Hướng dẫn sửa phần "Tìm kiếm và lọc" trong hosocongviec.html

## Vấn đề
Phần filter trong file `backend/templates/lanhdao/hosocongviec.html` bị thiếu dropdown lọc theo trạng thái và mức độ.

## Giải pháp

### Bước 1: Mở file cần sửa
Mở file: `d:\Projects_IT\htvb_mvt\backend\templates\lanhdao\hosocongviec.html`

### Bước 2: Tìm và thay thế
Tìm đoạn code từ dòng **104-141** (phần "Filters" và đầu "Task table"):

```html
                <!-- Filters -->
                <section class="mt-6 card p-4 fade-in">
                  <h3 class="text-sm font-semibold text-slate-700 mb-3">
                    Tìm kiếm và lọc
                  </h3>
                  <div class="grid grid-cols-1 md:grid-cols-7 gap-3">
                    <div class="md:col-span-3">
                      <input
                        type="text"
                        data-filter="q"
                        class="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-500"
                        placeholder="Tìm kiếm công việc…"
                      />
                    </div>
                    <div class="md:col-span-2">
                      <select
                        data-filter="status"
                        class="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-500"
                      >
                        <option value="">Tất cả trạng thái</option>
                        <option>Đang thực hiện</option>
                        <option>Hoàn thành</option>
                        <option>Trễ hạn</option>
                      </select>
                    </div>
                    <div class="md:col-span-2">
                      <select
                        data-filter="priority"
                        class="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-500"
                      >
                        <option value="">Tất cả mức độ</option>
                        <option>Cao</option>
                        <option>Trung bình</option>
                        <option>Thấp</option>
                      </select>
                    </div>
                  </div>
                </section>
```

### Bước 3: Thay thế bằng code mới

Thay thế đoạn code trên bằng nội dung trong file `PATCH_filter_section.html` (đã tạo sẵn).

## Chi tiết thay đổi

### 1. **Dropdown Trạng thái** (Đã cập nhật đầy đủ 7 trạng thái)
Thay vì 3 options cũ, bây giờ có đầy đủ:
- Mới tạo (MOI_TAO)
- Chờ phân công (CHO_PHAN_CONG) 
- Đã phân công (DA_PHAN_CONG)
- Đang thực hiện (DANG_THUC_HIEN)
- Tạm dừng (TAM_DUNG)
- Chờ duyệt đóng (CHO_DUYET_DONG)
- Đóng (DONG)

### 2. **Dropdown Mức độ** (Đã thêm value attributes)
Bây giờ các option có `value` để backend filter hoạt động:
- Khẩn cấp (URGENT)
- Cao (HIGH)
- Trung bình (MEDIUM)  
- Thấp (LOW)

### 3. **Layout** 
Giữ nguyên layout 7 columns:
- Search input: 3 columns
- Status dropdown: 2 columns  
- Priority dropdown: 2 columns

## Kiểm tra sau khi sửa

1. Mở trang `http://localhost:8000/lanhdao/hosocongviec.html`
2. Kiểm tra phần "Tìm kiếm và lọc" có đủ 3 trường:
   - Ô tìm kiếm
   - Dropdown "Tất cả trạng thái" với 7 options
   - Dropdown "Tất cả mức độ" với 4 options
3. Test filter để đảm bảo hoạt động đúng

## Lưu ý  

Các trạng thái được định nghĩa trong `backend/catalog/models.py` (model CaseStatus).
Nếu cần thêm/sửa trạng thái, phải kiểm tra cả:
- Database (bảng `case_statuses`)
- Model `CaseStatus`  
- JavaScript filter logic trong `lanhdao.js`
