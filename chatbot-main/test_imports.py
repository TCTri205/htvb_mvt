"""
Script kiểm tra imports cần thiết
"""
import sys
import io
# Fix encoding for Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

print("Testing imports...")

try:
    import sentence_transformers
    print("[OK] sentence-transformers: OK")
except ImportError as e:
    print(f"[FAIL] sentence-transformers: FAILED - {e}")
    print("   Install with: pip install sentence-transformers")

try:
    from langchain_community.embeddings import HuggingFaceEmbeddings
    print("[OK] HuggingFaceEmbeddings: OK")
except ImportError as e:
    print(f"[FAIL] HuggingFaceEmbeddings: FAILED - {e}")
    try:
        from langchain_huggingface import HuggingFaceEmbeddings
        print("[OK] HuggingFaceEmbeddings (from langchain_huggingface): OK")
    except ImportError as e2:
        print(f"[FAIL] HuggingFaceEmbeddings (fallback): FAILED - {e2}")

try:
    from langchain_groq import ChatGroq
    print("[OK] ChatGroq: OK")
except ImportError as e:
    print(f"[FAIL] ChatGroq: FAILED - {e}")

try:
    from langchain_community.vectorstores import FAISS
    print("[OK] FAISS: OK")
except ImportError as e:
    print(f"[FAIL] FAISS: FAILED - {e}")

try:
    from langchain_community.document_loaders import UnstructuredFileLoader
    print("[OK] UnstructuredFileLoader: OK")
except ImportError as e:
    print(f"[FAIL] UnstructuredFileLoader: FAILED - {e}")

print("\nTesting HuggingFaceEmbeddings initialization...")
try:
    import sentence_transformers
    from langchain_community.embeddings import HuggingFaceEmbeddings

    embeddings = HuggingFaceEmbeddings(
        model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        model_kwargs={'device': 'cpu'},
        encode_kwargs={'normalize_embeddings': True}
    )
    print("[OK] HuggingFaceEmbeddings initialization: OK")
except Exception as e:
    print(f"[FAIL] HuggingFaceEmbeddings initialization: FAILED - {e}")
    import traceback
    traceback.print_exc()

print("\nAll tests completed!")

