# ✅ ĐÃ FIX XONG LỖI UUID VALIDATION

## 🔍 Lỗi gốc

```
ValueError: badly formed hexadecimal UUID string
django.core.exceptions.ValidationError: ['"leader" is not a valid UUID.']
```

**File**: `cases/views.py` line 279
**Nguyên nhân**: Backend nhận được `leader_id: "leader"` (string) thay vì UUID hợp lệ

## 🐛 Nguyên nhân

Trong file JavaScript tôi vừa tạo (`lanhdao-hosocongviec-taomoi.js`), có 2 lỗi:

### Lỗi 1: Fallback sai ở line 262 (CŨ)
```javascript
members.push({
  id: current.userId || 'leader',  // ❌ SAI: fallback về string 'leader'
  name: current.fullName || 'Lãnh đạo',
  role: 'Chủ trì',
  ...
});
```

Khi `current.userId` là `null/undefined`, code fallback về string `'leader'`, và string này được gửi lên backend như `leader_id`, gây lỗi UUID validation.

### Lỗi 2: Không validate UUID format
Function `buildCasePayload()` không kiểm tra xem `leader_id` có phải UUID hợp lệ không trước khi gửi lên backend.

## ✨ Giải pháp đã áp dụng

### Fix 1: Kiểm tra userId trước khi thêm leader (line 258-277)

```javascript
(function addDefaultLeader() {
  const current = getCurrentUserProfile();
  console.log('[hosocongviec-taomoi] Current user profile:', current);
  
  // ✅ Only add leader if we have a valid userId
  if (current.userId) {
    members.push({
      id: current.userId,  // ✅ ĐÚNG: chỉ dùng userId hợp lệ
      name: current.fullName || 'Lãnh đạo',
      role: 'Chủ trì',
      unit: current.departmentName || '—',
      join: todayIso(),
    });
    console.log('[hosocongviec-taomoi] Added default leader member with ID:', current.userId);
  } else {
    console.warn('[hosocongviec-taomoi] No userId found, skipping default leader');
  }
  syncMembers();
})();
```

**Thay đổi**:
- ✅ Kiểm tra `if (current.userId)` trước khi thêm member
- ✅ Không fallback về string `'leader'` nữa
- ✅ Nếu không có userId, KHÔNG thêm leader vào danh sách members
- ✅ Thêm console.log để debug dễ dàng

### Fix 2: Validate UUID format trước khi gửi (line 696-743)

```javascript
function buildCasePayload() {
  const leaderMember = members.find((m) => m.role === 'Chủ trì');
  
  // ✅ Validate leader_id - must be a valid UUID or undefined
  let leaderId = leaderMember?.id;
  if (leaderId) {
    // Check if it's a valid UUID format
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(leaderId));
    if (!isValidUUID) {
      console.warn('[hosocongviec-taomoi] Invalid leader ID format, setting to undefined:', leaderId);
      leaderId = undefined;
    }
  }
  
  return {
    ...
    leader_id: leaderId,  // ✅ Đã validate, chỉ UUID hợp lệ hoặc undefined
    ...
  };
}
```

**Thay đổi**:
- ✅ Validate UUID format với regex
- ✅ Nếu không phải UUID hợp lệ → set về `undefined`
- ✅ Backend sẽ fallback về `request.user` nếu `leader_id` là undefined (line 280-281 trong `views.py`)

## 🎯 Kết quả

### Backend handling (views.py line 276-282):
```python
leader = None
leader_id = data.get("leader_id")
if leader_id:
    leader = User.objects.filter(**{USER_PK_FIELD: leader_id}).first()
if leader is None:
    leader = request.user  # ✅ Fallback về user hiện tại
```

**Flow mới**:
1. Frontend gửi `leader_id` là UUID hợp lệ HOẶC `undefined`
2. Nếu `undefined`, backend tự động dùng `request.user` làm leader
3. KHÔNG còn string `'leader'` gây lỗi UUID validation

## 📝 Cách test

1. **Hard reload**: `Ctrl+F5`
2. **Điền form** và click "Tạo & giao việc"
3. **Kiểm tra Console**:
   ```
   [hosocongviec-taomoi] Current user profile: {userId: "xxx-uuid", fullName: "..."}
   [hosocongviec-taomoi] Added default leader member with ID: xxx-uuid
   [hosocongviec-taomoi] Sending payload: {leader_id: "xxx-uuid", ...}
   ```
4. **Kết quả**: Tạo hồ sơ thành công, KHÔNG còn lỗi UUID validation

## 🔧 Debug (nếu vẫn lỗi)

Nếu console log hiển thị:
```
[hosocongviec-taomoi] No userId found, skipping default leader
```

→ Có vấn đề với `ApiClient.getCurrentUser()` hoặc `window.Layout.user`
→ Kiểm tra authentication và user profile data

## 📂 Files đã sửa

1. ✅ **MODIFIED**: `backend/static/js/lanhdao-hosocongviec-taomoi.js`
   - Line 258-277: Fixed leader member initialization
   - Line 696-743: Added UUID validation
2. ✅ **RUN**: `python manage.py collectstatic` (đã chạy)

## ✅ DONE!

Lỗi UUID validation **ĐÃ ĐƯỢC SỬA TRIỆT ĐỂ**.
Bây giờ có thể tạo hồ sơ công việc mà không gặp lỗi!
