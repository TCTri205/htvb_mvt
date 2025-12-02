-- Force update user cv01 to Department 1
UPDATE users SET department_id = 1 WHERE username = 'cv01';

-- Force update document 62 to Department 1
UPDATE documents SET department_id = 1 WHERE document_id = 62;

-- Verify
SELECT username, department_id FROM users WHERE username = 'cv01';
SELECT document_id, department_id FROM documents WHERE document_id = 62;
