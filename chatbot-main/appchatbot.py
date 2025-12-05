"""
Flask Web Application cho RAG Chatbot
"""
from flask import Flask, render_template, request, jsonify
import os
from pathlib import Path
import shutil
from rag_service import initialize_rag, ask_rag, add_document_to_vectorstore, is_initialized

# Optional CORS support
try:
    from flask_cors import CORS  # pyright: ignore[reportMissingModuleSource]
    CORS_AVAILABLE = True
except ImportError:
    CORS_AVAILABLE = False
    print(" flask-cors not installed. CORS support disabled.")

app = Flask(__name__)
if CORS_AVAILABLE:
    CORS(app)  # Cho phép CORS nếu cần

# Đảm bảo tất cả response đều là JSON
@app.after_request
def after_request(response):
    # Nếu response không phải JSON và là error, chuyển thành JSON
    if response.status_code >= 400:
        if not response.is_json:
            try:
                data = jsonify({
                    "error": f"HTTP {response.status_code}",
                    "message": response.get_data(as_text=True)[:200],
                    "status": "error"
                })
                return data
            except:
                pass
    return response

# Cấu hình
UPLOAD_FOLDER = "uploads"
DATA_FOLDER = "data"
VECTORSTORE_TYPE = "faiss"  # hoặc "chroma"
FAISS_DIR = "./faiss_index"
CHROMA_DIR = "./chroma_db"
K = 5
SCORE_THRESHOLD = 0.2

# Tạo thư mục nếu chưa có
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(DATA_FOLDER, exist_ok=True)

# Khởi tạo RAG system khi start app
try:
    if Path(DATA_FOLDER).exists() and any(Path(DATA_FOLDER).glob("*.pdf")):
        initialize_rag(
            vectorstore_type=VECTORSTORE_TYPE,
            data_path=DATA_FOLDER,
            faiss_dir=FAISS_DIR,
            chroma_dir=CHROMA_DIR,
            k=K,
            score_threshold=SCORE_THRESHOLD
        )
        print(" RAG system đã được khởi tạo thành công!")
    else:
        print(" Chưa có file PDF trong thư mục data. Upload PDF để bắt đầu.")
except Exception as e:
    print(f" Lỗi khi khởi tạo RAG system: {str(e)}")

@app.route("/")
def home():
    """Trang chủ"""
    return render_template("index.html")

@app.route("/favicon.ico")
def favicon():
    """Favicon handler để tránh 404"""
    # Trả về 204 No Content thay vì 404
    return '', 204

@app.route("/api/status", methods=["GET"])
def get_status():
    """API kiểm tra trạng thái RAG system"""
    return jsonify({
        "initialized": is_initialized(),
        "data_folder": DATA_FOLDER,
        "vectorstore_type": VECTORSTORE_TYPE
    })

@app.route("/api/chat", methods=["POST"])
def chat():
    """API chat với RAG system"""
    try:
        # Kiểm tra Content-Type
        if not request.is_json:
            return jsonify({
                "error": "Content-Type phải là application/json",
                "reply": "Lỗi: Request không đúng định dạng"
            }), 400

        data = request.get_json()
        if not data or "message" not in data:
            return jsonify({
                "error": "Thiếu trường 'message' trong request",
                "reply": "Lỗi: Thiếu thông tin câu hỏi"
            }), 400

        user_message = data["message"].strip()
        if not user_message:
            return jsonify({
                "error": "Câu hỏi không được để trống",
                "reply": "Lỗi: Câu hỏi không được để trống"
            }), 400

        if not is_initialized():
            return jsonify({
                "error": "RAG system chưa được khởi tạo. Vui lòng upload PDF trước.",
                "reply": "Xin lỗi, hệ thống chưa sẵn sàng. Vui lòng upload file PDF để bắt đầu.",
                "status": "not_initialized"
            }), 503

        # Gọi RAG để trả lời
        try:
            reply = ask_rag(user_message)
            if not reply or reply.strip() == "":
                reply = "Xin lỗi, tôi không thể tìm thấy câu trả lời phù hợp trong tài liệu."
        except Exception as rag_error:
            print(f"Lỗi trong RAG: {str(rag_error)}")
            reply = f"Xin lỗi, đã xảy ra lỗi khi xử lý câu hỏi: {str(rag_error)}"

        return jsonify({
            "reply": reply,
            "status": "success"
        }), 200

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Lỗi trong API chat: {error_trace}")
        return jsonify({
            "error": str(e),
            "reply": f"Xin lỗi, đã xảy ra lỗi: {str(e)}",
            "status": "error"
        }), 500

@app.route("/api/upload", methods=["POST"])
def upload_pdf():
    """API upload PDF và xử lý"""
    try:
        if "pdf" not in request.files:
            return jsonify({
                "error": "Không có file PDF trong request",
                "status": "error",
                "message": "Lỗi: Không tìm thấy file PDF"
            }), 400

        pdf_file = request.files["pdf"]
        if pdf_file.filename == "":
            return jsonify({
                "error": "Tên file không được để trống",
                "status": "error",
                "message": "Lỗi: Tên file không được để trống"
            }), 400

        if not pdf_file.filename.lower().endswith('.pdf'):
            return jsonify({
                "error": "Chỉ chấp nhận file PDF",
                "status": "error",
                "message": "Lỗi: Chỉ chấp nhận file PDF"
            }), 400

        # Lưu file vào thư mục uploads
        filename = pdf_file.filename
        # Làm sạch filename để tránh lỗi với ký tự đặc biệt
        import re
        safe_filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
        if safe_filename != filename:
            print(f" Filename đã được làm sạch: {filename} -> {safe_filename}")
            filename = safe_filename

        # Đảm bảo thư mục tồn tại
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
        os.makedirs(DATA_FOLDER, exist_ok=True)

        upload_path = os.path.join(UPLOAD_FOLDER, filename)

        try:
            pdf_file.save(upload_path)
            print(f" Đã lưu file: {upload_path}")
        except Exception as save_error:
            import traceback
            error_trace = traceback.format_exc()
            print(f" Lỗi khi lưu file: {error_trace}")
            return jsonify({
                "error": f"Lỗi khi lưu file: {str(save_error)}",
                "status": "error",
                "message": f"Lỗi khi lưu file: {str(save_error)}"
            }), 500

        # Copy file vào thư mục data
        data_path = os.path.join(DATA_FOLDER, filename)
        try:
            # Nếu file đã tồn tại, xóa trước
            if os.path.exists(data_path):
                os.remove(data_path)
            shutil.copy2(upload_path, data_path)
            print(f" Đã copy file: {data_path}")
        except Exception as copy_error:
            import traceback
            error_trace = traceback.format_exc()
            print(f" Lỗi khi copy file: {error_trace}")
            return jsonify({
                "error": f"Lỗi khi copy file: {str(copy_error)}",
                "status": "error",
                "message": f"Lỗi khi copy file: {str(copy_error)}"
            }), 500

        # Nếu RAG system chưa được khởi tạo, khởi tạo mới
        try:
            print(f" Đang xử lý RAG cho file: {filename}")
            if not is_initialized():
                print(" Khởi tạo RAG system mới...")
                initialize_rag(
                    vectorstore_type=VECTORSTORE_TYPE,
                    data_path=DATA_FOLDER,
                    faiss_dir=FAISS_DIR,
                    chroma_dir=CHROMA_DIR,
                    k=K,
                    score_threshold=SCORE_THRESHOLD
                )
                print(" RAG system đã được khởi tạo")
                message = f"Đã upload và xử lý file {filename}. Hệ thống đã sẵn sàng!"
            else:
                print(" Thêm document vào vectorstore hiện có...")
                try:
                    add_document_to_vectorstore(data_path)
                    print(" Đã thêm document vào vectorstore")
                    message = f"Đã thêm file {filename} vào cơ sở tri thức!"
                except Exception as add_error:
                    # Nếu không thể thêm vào vectorstore hiện có, khởi tạo lại
                    print(f" Không thể thêm vào vectorstore hiện có: {str(add_error)}")
                    print(" Khởi tạo lại RAG system...")
                    # Xóa index cũ
                    if VECTORSTORE_TYPE == "faiss" and os.path.exists(FAISS_DIR):
                        shutil.rmtree(FAISS_DIR)
                    elif VECTORSTORE_TYPE == "chroma" and os.path.exists(CHROMA_DIR):
                        shutil.rmtree(CHROMA_DIR)
                    # Khởi tạo lại
                    initialize_rag(
                        vectorstore_type=VECTORSTORE_TYPE,
                        data_path=DATA_FOLDER,
                        faiss_dir=FAISS_DIR,
                        chroma_dir=CHROMA_DIR,
                        k=K,
                        score_threshold=SCORE_THRESHOLD
                    )
                    print(" Đã khởi tạo lại RAG system")
                    message = f"Đã upload và xử lý file {filename}. Hệ thống đã sẵn sàng!"
        except Exception as rag_error:
            import traceback
            error_trace = traceback.format_exc()
            print(f" Lỗi khi xử lý RAG: {error_trace}")
            return jsonify({
                "error": f"Lỗi khi xử lý RAG: {str(rag_error)}",
                "status": "error",
                "message": f"Đã upload file nhưng gặp lỗi khi xử lý: {str(rag_error)}"
            }), 500

        return jsonify({
            "status": "success",
            "filename": filename,
            "message": message
        }), 200

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Lỗi trong API upload: {error_trace}")
        return jsonify({
            "error": str(e),
            "status": "error",
            "message": f"Lỗi không xác định: {str(e)}"
        }), 500

@app.route("/api/reinitialize", methods=["POST"])
def reinitialize():
    """API khởi tạo lại RAG system (sau khi thêm/xóa file)"""
    try:
        # Xóa index cũ nếu cần
        if VECTORSTORE_TYPE == "faiss" and Path(FAISS_DIR).exists():
            shutil.rmtree(FAISS_DIR)
        elif VECTORSTORE_TYPE == "chroma" and Path(CHROMA_DIR).exists():
            shutil.rmtree(CHROMA_DIR)

        # Khởi tạo lại
        initialize_rag(
            vectorstore_type=VECTORSTORE_TYPE,
            data_path=DATA_FOLDER,
            faiss_dir=FAISS_DIR,
            chroma_dir=CHROMA_DIR,
            k=K,
            score_threshold=SCORE_THRESHOLD
        )

        return jsonify({
            "status": "success",
            "message": "Đã khởi tạo lại RAG system thành công"
        })

    except Exception as e:
        return jsonify({
            "error": str(e),
            "status": "error"
        }), 500

# Error handlers để luôn trả về JSON
@app.errorhandler(404)
def not_found(error):
    return jsonify({
        "error": "Endpoint not found",
        "message": "API endpoint không tồn tại",
        "status": "error"
    }), 404

@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({
        "error": "Method not allowed",
        "message": "Phương thức HTTP không được phép cho endpoint này",
        "status": "error"
    }), 405

@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        "error": "Internal server error",
        "message": "Đã xảy ra lỗi server",
        "status": "error"
    }), 500

@app.errorhandler(Exception)
def handle_exception(e):
    import traceback
    error_trace = traceback.format_exc()
    print(f"Unhandled exception: {error_trace}")
    return jsonify({
        "error": str(e),
        "message": f"Lỗi không xác định: {str(e)}",
        "status": "error"
    }), 500

if __name__ == "__main__":
    import sys
    # Cho phép chọn port từ command line hoặc biến môi trường
    port = int(os.getenv('PORT', 5000))
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass

    print(" Starting Flask app...")
    print(f" Data folder: {DATA_FOLDER}")
    print(f" Upload folder: {UPLOAD_FOLDER}")
    print(f" Vectorstore type: {VECTORSTORE_TYPE}")
    print(f" Server running on: http://localhost:{port}")
    print(f" Server running on: http://127.0.0.1:{port}")
    app.run(debug=True, host="0.0.0.0", port=port)
