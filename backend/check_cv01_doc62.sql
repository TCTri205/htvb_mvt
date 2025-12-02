-- Check user cv01
SELECT u.user_id, u.username, u.full_name, u.department_id, d.name as dept_name
FROM users u
LEFT JOIN departments d ON d.department_id = u.department_id
WHERE u.username = 'cv01';

-- Check document 62
SELECT d.document_id, d.title, d.department_id, dept.name as doc_dept_name, d.created_by_id, u.username as creator
FROM documents d
LEFT JOIN departments dept ON dept.department_id = d.department_id
LEFT JOIN users u ON u.user_id = d.created_by_id
WHERE d.document_id = 62;
