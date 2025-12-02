-- =====================================================
-- Script kiểm tra Users và Departments
-- =====================================================

-- 1. Kiểm tra tổng số users theo role
SELECT 
    r.name as role_name,
    COUNT(DISTINCT ur.user_id) as user_count
FROM roles r
LEFT JOIN user_roles ur ON r.role_id = ur.role_id
GROUP BY r.role_id, r.name
ORDER BY user_count DESC;

-- 2. Kiểm tra CVs theo department
SELECT 
    d.department_id,
    d.name as department_name,
    COUNT(DISTINCT u.user_id) as cv_count
FROM departments d
LEFT JOIN users u ON u.department_id = d.department_id
LEFT JOIN user_roles ur ON ur.user_id = u.user_id
LEFT JOIN roles r ON r.role_id = ur.role_id
WHERE r.name IN ('CV', 'CHUYEN_VIEN') OR r.name IS NULL
GROUP BY d.department_id, d.name
ORDER BY cv_count DESC, d.name;

-- 3. Chi tiết CVs trong department 8
SELECT 
    u.user_id,
    u.username,
    u.full_name,
    u.email,
    d.department_id,
    d.name as department_name,
    r.name as role_name
FROM users u
LEFT JOIN departments d ON d.department_id = u.department_id
LEFT JOIN user_roles ur ON ur.user_id = u.user_id
LEFT JOIN roles r ON r.role_id = ur.role_id
WHERE u.department_id = 8 
  AND r.name IN ('CV', 'CHUYEN_VIEN')
ORDER BY u.full_name;

-- 4. Tất cả CVs trong hệ thống với department của họ
SELECT 
    u.user_id,
    u.username,
    u.full_name,
    u.department_id,
    d.name as department_name,
    r.name as role_name
FROM users u
LEFT JOIN departments d ON d.department_id = u.department_id
INNER JOIN user_roles ur ON ur.user_id = u.user_id
INNER JOIN roles r ON r.role_id = ur.role_id
WHERE r.name IN ('CV', 'CHUYEN_VIEN')
ORDER BY d.name, u.full_name;

-- 5. Kiểm tra document 60 thuộc department nào
SELECT 
    doc.document_id,
    doc.title,
    doc.main_department_id,
    d.name as main_department_name,
    doc.department_id as doc_department_id,
    d2.name as doc_department_name
FROM documents_document doc
LEFT JOIN departments d ON d.department_id = doc.main_department_id
LEFT JOIN departments d2 ON d2.department_id = doc.department_id
WHERE doc.document_id = 60;

-- 6. Gợi ý: Tìm departments có CVs để test
SELECT 
    d.department_id,
    d.name as department_name,
    COUNT(DISTINCT u.user_id) as cv_count,
    STRING_AGG(u.full_name, ', ' ORDER BY u.full_name) as cv_names
FROM departments d
INNER JOIN users u ON u.department_id = d.department_id
INNER JOIN user_roles ur ON ur.user_id = u.user_id
INNER JOIN roles r ON r.role_id = ur.role_id
WHERE r.name IN ('CV', 'CHUYEN_VIEN')
GROUP BY d.department_id, d.name
HAVING COUNT(DISTINCT u.user_id) > 0
ORDER BY cv_count DESC
LIMIT 10;
