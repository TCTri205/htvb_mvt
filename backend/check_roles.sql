SELECT r.name FROM roles r JOIN user_roles ur ON r.role_id = ur.role_id JOIN users u ON ur.user_id = u.user_id WHERE u.username = 'cv01';
