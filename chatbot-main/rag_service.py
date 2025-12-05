"""
RAG Service Module - Tái sử dụng logic RAG cho web app
"""
from dotenv import load_dotenv
load_dotenv()

import os
from pathlib import Path

# Import sentence_transformers trước để đảm bảo nó được load
try:
    import sentence_transformers
    print(" sentence-transformers imported successfully")
except ImportError as e:
    print(f" Error importing sentence-transformers: {e}")
    print("Please install with: pip install sentence-transformers")
    raise

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import DirectoryLoader, UnstructuredFileLoader
from langchain_community.vectorstores import Chroma, FAISS
from langchain_community.vectorstores.utils import DistanceStrategy
from langchain_groq import ChatGroq
# Ưu tiên dùng langchain_huggingface (khuyến nghị mới)
try:
    from langchain_huggingface import HuggingFaceEmbeddings  # pyright: ignore[reportMissingImports]
    print(" Using HuggingFaceEmbeddings from langchain_huggingface")
except ImportError:
    # Fallback cho langchain_community (deprecated)
    try:
        from langchain_community.embeddings import HuggingFaceEmbeddings
        print("️ Using deprecated HuggingFaceEmbeddings from langchain_community")
        print("   Consider installing: pip install langchain-huggingface")
    except ImportError:
        error_msg = "Cannot import HuggingFaceEmbeddings. Install with: pip install langchain-huggingface"
        print(f" {error_msg}")
        raise ImportError(error_msg)

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough, RunnableParallel

# Global variables để cache
_embeddings = None
_vectorstore = None
_rag_chain = None
_vectorstore_type = "faiss"
_data_path = "./data"
_faiss_dir = "./faiss_index"
_chroma_dir = "./chroma_db"
_k = 5
_score_threshold = 0.2

def get_embeddings():
    """Lấy hoặc tạo embeddings (singleton)"""
    global _embeddings
    if _embeddings is None:
        try:
            # Kiểm tra sentence_transformers có sẵn không
            import sentence_transformers
            print(" sentence-transformers is available")
        except ImportError:
            error_msg = (
                "sentence-transformers package is not installed. "
                "Please install it with: pip install sentence-transformers"
            )
            print(f" {error_msg}")
            raise ImportError(error_msg)

        try:
            _embeddings = HuggingFaceEmbeddings(
                model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",  # Model đa ngôn ngữ, nhẹ
                model_kwargs={'device': 'cpu'},
                encode_kwargs={'normalize_embeddings': True}
            )
            print(" HuggingFaceEmbeddings initialized successfully")
        except Exception as e:
            error_msg = f"Failed to initialize HuggingFaceEmbeddings: {str(e)}"
            print(f" {error_msg}")
            raise RuntimeError(error_msg) from e
    return _embeddings

def format_docs(docs):
    """Trích xuất page_content từ Documents và ghép lại"""
    return "\n\n".join(doc.page_content for doc in docs)

def initialize_rag(vectorstore_type="faiss", data_path="./data",
                   faiss_dir="./faiss_index", chroma_dir="./chroma_db",
                   k=5, score_threshold=0.2):
    """
    Khởi tạo RAG system

    Args:
        vectorstore_type: "faiss" hoặc "chroma"
        data_path: Đường dẫn thư mục chứa PDF
        faiss_dir: Thư mục lưu FAISS index
        chroma_dir: Thư mục lưu Chroma DB
        k: Số lượng documents để retrieve
        score_threshold: Ngưỡng điểm similarity
    """
    global _vectorstore, _rag_chain, _vectorstore_type, _data_path
    global _faiss_dir, _chroma_dir, _k, _score_threshold

    _vectorstore_type = vectorstore_type
    _data_path = data_path
    _faiss_dir = faiss_dir
    _chroma_dir = chroma_dir
    _k = k
    _score_threshold = score_threshold

    embeddings = get_embeddings()

    # Load PDF documents
    loader = DirectoryLoader(
        path=data_path,
        glob="**/*.pdf",
        loader_cls=UnstructuredFileLoader,
        show_progress=False,
        use_multithreading=True,
    )
    docs = loader.load()

    if not docs:
        raise ValueError(f"Không tìm thấy file PDF nào trong {data_path}")

    # Split documents
    MARKDOWN_SEPARATORS = [
        "\n#{1,6} ",
        "```\n",
        "\n\\*\\*\\*+\n",
        "\n---+\n",
        "\n___+\n",
        "\n\n",
        "\n",
        " ",
        "",
    ]

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1200,
        chunk_overlap=200,
        add_start_index=True,
        strip_whitespace=True,
        separators=MARKDOWN_SEPARATORS,
    )
    splits = text_splitter.split_documents(docs)

    # Build hoặc Load Vectorstore
    if vectorstore_type == "faiss":
        idx_dir = Path(faiss_dir)
        if idx_dir.exists() and any(idx_dir.iterdir()):
            _vectorstore = FAISS.load_local(
                folder_path=str(idx_dir),
                embeddings=embeddings,
                allow_dangerous_deserialization=True
            )
            print(f"Loaded FAISS index from {idx_dir.resolve()}")
        else:
            _vectorstore = FAISS.from_documents(
                documents=splits,
                embedding=embeddings,
                distance_strategy=DistanceStrategy.COSINE
            )
            idx_dir.mkdir(parents=True, exist_ok=True)
            _vectorstore.save_local(str(idx_dir))
            print(f"Created new FAISS index at {idx_dir.resolve()}")
    else:
        persist_dir = Path(chroma_dir)
        if persist_dir.exists() and any(persist_dir.iterdir()):
            _vectorstore = Chroma(
                collection_name="rag",
                embedding_function=embeddings,
                persist_directory=str(persist_dir),
            )
            print(f"Loaded Chroma DB from {persist_dir.resolve()}")
        else:
            _vectorstore = Chroma.from_documents(
                documents=splits,
                embedding=embeddings,
                collection_name="rag",
                persist_directory=str(persist_dir),
                collection_metadata={"hnsw:space": "cosine"}
            )
            _vectorstore.persist()
            print(f"Created new Chroma DB at {persist_dir.resolve()}")

    # Create retriever
    retriever = _vectorstore.as_retriever(
        search_type="similarity_score_threshold",
        search_kwargs={"k": k, "score_threshold": score_threshold}
    )

    # Prompt template
    template = (
        "Bạn là một trợ lý ảo, tập trung vào trích dẫn từ cơ sở tri thức riêng.\n"
        "QUY TẮC:\n"
        "1) Chỉ sử dụng NGUYÊN VĂN NGỮ LIỆU CUNG CẤP để trả lời.\n"
        "2) Nếu câu trả lời không rõ ràng từ ngữ liệu, hãy nói: \"Tôi không biết dựa trên các tài liệu đã cung cấp.\"\n"
        "3) KHÔNG sử dụng kiến thức bên ngoài, đoán, hoặc tìm kiếm trên web.\n"
        "4) Nếu có thể, trích dẫn nguồn theo định dạng (nguồn:trang) dựa trên metadata.\n\n"
        "Ngữ liệu:\n{context}\n\n"
        "Câu hỏi: {question}"
    )
    prompt = ChatPromptTemplate.from_template(template)

    # LLM
    llm = ChatGroq(
        model="llama-3.1-8b-instant",
        groq_api_key=os.getenv("GROQ_API_KEY"),
        temperature=0.1,
        max_tokens=512
    )

    # RAG Chain
    _rag_chain = (
        RunnableParallel(
            {"context": retriever | format_docs, "question": RunnablePassthrough()}
        )
        | prompt
        | llm
        | StrOutputParser()
    )

    return True

def add_document_to_vectorstore(file_path, vectorstore_type=None):
    """
    Thêm một document mới vào vectorstore hiện có

    Args:
        file_path: Đường dẫn file PDF
        vectorstore_type: "faiss" hoặc "chroma" (mặc định dùng global)
    """
    global _vectorstore, _vectorstore_type

    if _vectorstore is None:
        raise ValueError("Vectorstore chưa được khởi tạo. Gọi initialize_rag() trước.")

    # Load document
    loader = UnstructuredFileLoader(file_path)
    doc = loader.load()

    # Split document
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1200,
        chunk_overlap=200,
        add_start_index=True,
        strip_whitespace=True,
    )
    splits = text_splitter.split_documents(doc)

    # Add to vectorstore
    if _vectorstore_type == "faiss":
        _vectorstore.add_documents(splits)
        _vectorstore.save_local(_faiss_dir)
    else:
        _vectorstore.add_documents(splits)
        _vectorstore.persist()

    return True

def ask_rag(question):
    """
    Hỏi câu hỏi và nhận câu trả lời từ RAG system

    Args:
        question: Câu hỏi của người dùng

    Returns:
        str: Câu trả lời từ RAG system
    """
    global _rag_chain

    if _rag_chain is None:
        raise ValueError("RAG system chưa được khởi tạo. Gọi initialize_rag() trước.")

    try:
        response = _rag_chain.invoke(question)
        return response
    except Exception as e:
        return f"Lỗi khi xử lý câu hỏi: {str(e)}"

def is_initialized():
    """Kiểm tra xem RAG system đã được khởi tạo chưa"""
    return _rag_chain is not None and _vectorstore is not None

