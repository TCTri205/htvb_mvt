@echo off
setlocal
cd /d "d:\Projects_IT\htvb_mvt"

echo ================================================
echo CLEANUP SCRIPT - Xoa cac file khong can thiet
echo ================================================
echo.
echo Chuong trinh nay se xoa cac file sau:
echo - Backup files (1 file)
echo - Test scripts (7 files)
echo - Debug scripts (5 files)  
echo - Check scripts (6 files)
echo - Verify scripts (10 files)
echo - Temporary scripts (2 files in backend + 10 in root)
echo - Fix/update scripts (13 files)
echo - SQL scripts (7 files)
echo - Documentation MD files (10 files)
echo.
echo TONG CONG: ~60 files (~150 KB)
echo.
echo LUU Y: Khong xoa __pycache__ directories
echo.
pause

echo.
echo ================================================
echo BAT DAU XOA FILES...
echo ================================================
echo.

cd backend

echo [1/10] Xoa backup file...
if exist requirements.txt.backup del /q requirements.txt.backup && echo   ✓ Deleted: requirements.txt.backup

echo.
echo [2/10] Xoa test scripts...
if exist test_chatbot_api.py del /q test_chatbot_api.py && echo   ✓ Deleted: test_chatbot_api.py
if exist test_chatbot_endpoint.py del /q test_chatbot_endpoint.py && echo   ✓ Deleted: test_chatbot_endpoint.py
if exist test_chatbot_installation.py del /q test_chatbot_installation.py && echo   ✓ Deleted: test_chatbot_installation.py
if exist test_dept_fix.py del /q test_dept_fix.py && echo   ✓ Deleted: test_dept_fix.py
if exist test_register.py del /q test_register.py && echo   ✓ Deleted: test_register.py
if exist test_status_api.py del /q test_status_api.py && echo   ✓ Deleted: test_status_api.py
if exist test_withdraw.py del /q test_withdraw.py && echo   ✓ Deleted: test_withdraw.py

echo.
echo [3/10] Xoa debug scripts...
if exist debug_cv01.py del /q debug_cv01.py && echo   ✓ Deleted: debug_cv01.py
if exist debug_import.py del /q debug_import.py && echo   ✓ Deleted: debug_import.py
if exist debug_perm.py del /q debug_perm.py && echo   ✓ Deleted: debug_perm.py
if exist debug_perm_file.py del /q debug_perm_file.py && echo   ✓ Deleted: debug_perm_file.py
if exist debug_simple.py del /q debug_simple.py && echo   ✓ Deleted: debug_simple.py

echo.
echo [4/10] Xoa check scripts...
if exist check_cv01_doc62.py del /q check_cv01_doc62.py && echo   ✓ Deleted: check_cv01_doc62.py
if exist check_db.py del /q check_db.py && echo   ✓ Deleted: check_db.py
if exist check_db_connection.py del /q check_db_connection.py && echo   ✓ Deleted: check_db_connection.py
if exist check_ids_file.py del /q check_ids_file.py && echo   ✓ Deleted: check_ids_file.py
if exist check_pdfs_in_database.py del /q check_pdfs_in_database.py && echo   ✓ Deleted: check_pdfs_in_database.py
if exist check_user_role.py del /q check_user_role.py && echo   ✓ Deleted: check_user_role.py

echo.
echo [5/10] Xoa verify scripts...
if exist verify_analytics.py del /q verify_analytics.py && echo   ✓ Deleted: verify_analytics.py
if exist verify_analytics_v2.py del /q verify_analytics_v2.py && echo   ✓ Deleted: verify_analytics_v2.py
if exist verify_analytics_v3.py del /q verify_analytics_v3.py && echo   ✓ Deleted: verify_analytics_v3.py
if exist verify_analytics_v4.py del /q verify_analytics_v4.py && echo   ✓ Deleted: verify_analytics_v4.py
if exist verify_dept1.py del /q verify_dept1.py && echo   ✓ Deleted: verify_dept1.py
if exist verify_dept_perf.py del /q verify_dept_perf.py && echo   ✓ Deleted: verify_dept_perf.py
if exist verify_doc_type.py del /q verify_doc_type.py && echo   ✓ Deleted: verify_doc_type.py
if exist verify_fix.py del /q verify_fix.py && echo   ✓ Deleted: verify_fix.py
if exist verify_update.py del /q verify_update.py && echo   ✓ Deleted: verify_update.py
if exist verify_user_id.py del /q verify_user_id.py && echo   ✓ Deleted: verify_user_id.py

echo.
echo [6/10] Xoa temporary scripts (backend)...
if exist tmp_disp.py del /q tmp_disp.py && echo   ✓ Deleted: tmp_disp.py
if exist tmp_disp2.py del /q tmp_disp2.py && echo   ✓ Deleted: tmp_disp2.py

echo.
echo [7/10] Xoa fix/update scripts...
if exist fix_all.py del /q fix_all.py && echo   ✓ Deleted: fix_all.py
if exist fix_cv01_dept.py del /q fix_cv01_dept.py && echo   ✓ Deleted: fix_cv01_dept.py
if exist fix_env_file.py del /q fix_env_file.py && echo   ✓ Deleted: fix_env_file.py
if exist fix_pdf_attachment_types.py del /q fix_pdf_attachment_types.py && echo   ✓ Deleted: fix_pdf_attachment_types.py
if exist final_fix.py del /q final_fix.py && echo   ✓ Deleted: final_fix.py
if exist replace_workflow.py del /q replace_workflow.py && echo   ✓ Deleted: replace_workflow.py
if exist update_perm.py del /q update_perm.py && echo   ✓ Deleted: update_perm.py
if exist update_perm_ld.py del /q update_perm_ld.py && echo   ✓ Deleted: update_perm_ld.py
if exist cleanup_missing_pdfs.py del /q cleanup_missing_pdfs.py && echo   ✓ Deleted: cleanup_missing_pdfs.py
if exist diagnose_cvs.py del /q diagnose_cvs.py && echo   ✓ Deleted: diagnose_cvs.py
if exist audit_file.py del /q audit_file.py && echo   ✓ Deleted: audit_file.py
if exist audit_system.py del /q audit_system.py && echo   ✓ Deleted: audit_system.py
if exist add_chatbot_dependencies.py del /q add_chatbot_dependencies.py && echo   ✓ Deleted: add_chatbot_dependencies.py

echo.
echo [8/10] Xoa SQL scripts...
if exist check_cv01_doc62.sql del /q check_cv01_doc62.sql && echo   ✓ Deleted: check_cv01_doc62.sql
if exist check_dept1_users.sql del /q check_dept1_users.sql && echo   ✓ Deleted: check_dept1_users.sql
if exist check_ids.sql del /q check_ids.sql && echo   ✓ Deleted: check_ids.sql
if exist check_roles.sql del /q check_roles.sql && echo   ✓ Deleted: check_roles.sql
if exist check_users_departments.sql del /q check_users_departments.sql && echo   ✓ Deleted: check_users_departments.sql
if exist force_fix.sql del /q force_fix.sql && echo   ✓ Deleted: force_fix.sql
if exist update_data.sql del /q update_data.sql && echo   ✓ Deleted: update_data.sql

echo.
echo [9/10] Xoa documentation MD files (backend)...
if exist CHATBOT_DEPENDENCIES_NOTE.md del /q CHATBOT_DEPENDENCIES_NOTE.md && echo   ✓ Deleted: CHATBOT_DEPENDENCIES_NOTE.md
if exist CHATBOT_INSTALLATION_GUIDE.md del /q CHATBOT_INSTALLATION_GUIDE.md && echo   ✓ Deleted: CHATBOT_INSTALLATION_GUIDE.md
if exist CHATBOT_QUICK_START.md del /q CHATBOT_QUICK_START.md && echo   ✓ Deleted: CHATBOT_QUICK_START.md
if exist CHATBOT_SETUP_FINAL.md del /q CHATBOT_SETUP_FINAL.md && echo   ✓ Deleted: CHATBOT_SETUP_FINAL.md
if exist CHECK_SPECIALISTS_GUIDE.md del /q CHECK_SPECIALISTS_GUIDE.md && echo   ✓ Deleted: CHECK_SPECIALISTS_GUIDE.md
if exist FIX_ENV_FILE.md del /q FIX_ENV_FILE.md && echo   ✓ Deleted: FIX_ENV_FILE.md
if exist PDF_DETECTION_ANALYSIS.md del /q PDF_DETECTION_ANALYSIS.md && echo   ✓ Deleted: PDF_DETECTION_ANALYSIS.md

echo.
echo [10/10] Xoa temporary files (root directory)...
cd ..
if exist FIX_SUMMARY_CASE_CREATION.md del /q FIX_SUMMARY_CASE_CREATION.md && echo   ✓ Deleted: FIX_SUMMARY_CASE_CREATION.md
if exist FIX_UUID_VALIDATION_ERROR.md del /q FIX_UUID_VALIDATION_ERROR.md && echo   ✓ Deleted: FIX_UUID_VALIDATION_ERROR.md
if exist HUONG_DAN_SUA_FILTER.md del /q HUONG_DAN_SUA_FILTER.md && echo   ✓ Deleted: HUONG_DAN_SUA_FILTER.md
if exist z_promts.txt del /q z_promts.txt && echo   ✓ Deleted: z_promts.txt
if exist PATCH_filter_section.html del /q PATCH_filter_section.html && echo   ✓ Deleted: PATCH_filter_section.html
if exist PATCH_handleAddMember.js del /q PATCH_handleAddMember.js && echo   ✓ Deleted: PATCH_handleAddMember.js
if exist script.py del /q script.py && echo   ✓ Deleted: script.py
if exist tmp_line.py del /q tmp_line.py && echo   ✓ Deleted: tmp_line.py
if exist __fix_vanthu.py del /q __fix_vanthu.py && echo   ✓ Deleted: __fix_vanthu.py
if exist temp_vanthu_vanbanden.txt del /q temp_vanthu_vanbanden.txt && echo   ✓ Deleted: temp_vanthu_vanbanden.txt

echo.
echo ================================================
echo HOAN TAT!
echo ================================================
echo.
echo Da xoa ~60 files khong can thiet (~150 KB).
echo.
echo LUU Y: Cac thu muc __pycache__ KHONG bi xoa (theo yeu cau).
echo.
echo Hay kiem tra lai he thong de dam bao moi thu hoat dong binh thuong.
echo.
pause
