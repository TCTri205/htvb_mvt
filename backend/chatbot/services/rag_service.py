# chatbot/services/rag_service.py
"""
RAG Service Module - Port từ chatbot-main/rag_service.py
Điều chỉnh để tích hợp với Django và đọc PDF từ database
"""
import os
import logging
from pathlib import Path
from django.conf import settings

logger = logging.getLogger(__name__)

# Global variables để cache (singleton pattern)
_embeddings = None
_vectorstore = None
_rag_chain = None
_vectorstore_type = "faiss"
_k = 5
_score_threshold = 0.2


def get_embeddings():
    """
    Lấy hoặc tạo embeddings model (singleton pattern)
    Uses multilingual model for Vietnamese support
    """
    global _embeddings
    
    if _embeddings is None:
        try:
            # Embeddings - ưu tiên langchain_huggingface
            try:
                from langchain_huggingface import HuggingFaceEmbeddings
                logger.info("Using HuggingFaceEmbeddings from langchain_huggingface")
            except ImportError:
                from langchain_community.embeddings import HuggingFaceEmbeddings
                logger.warning("Using deprecated HuggingFaceEmbeddings from langchain_community")

            logger.info("Initializing HuggingFace Embeddings...")
            _embeddings = HuggingFaceEmbeddings(
                model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
                model_kwargs={'device': 'cpu'},
                encode_kwargs={'normalize_embeddings': True}
            )
            logger.info("✓ Embeddings initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize embeddings: {str(e)}")
            raise RuntimeError(f"Failed to initialize embeddings: {str(e)}") from e
            
    return _embeddings


def format_docs(docs):
    """Trích xuất page_content từ Documents và ghép lại"""
    return "\n\n".join(doc.page_content for doc in docs)


def initialize_rag(vectorstore_type=None, k=None, score_threshold=None):
    """
    Khởi tạo RAG system với PDFs từ database
    
    Args:
        vectorstore_type: "faiss" hoặc "chroma" (default từ settings)
        k: Số documents để retrieve (default từ settings)
        score_threshold: Ngưỡng similarity (default từ settings)
        
    Returns:
        bool: True nếu khởi tạo thành công
    """
    global _vectorstore, _rag_chain, _vectorstore_type, _k, _score_threshold
    
    # Import LangChain components lazily
    try:
        from langchain_text_splitters import RecursiveCharacterTextSplitter
        from langchain_community.vectorstores import Chroma, FAISS
        from langchain_community.vectorstores.utils import DistanceStrategy
        from langchain_groq import ChatGroq
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_core.output_parsers import StrOutputParser
        from langchain_core.runnables import RunnablePassthrough, RunnableParallel, RunnableLambda
    except ImportError as e:
        logger.error(f"LangChain import error: {e}")
        raise

    # Get settings
    _vectorstore_type = vectorstore_type or getattr(settings, 'CHATBOT_VECTORSTORE_TYPE', 'faiss')
    _k = k or getattr(settings, 'CHATBOT_K', 5)
    _score_threshold = score_threshold or getattr(settings, 'CHATBOT_SCORE_THRESHOLD', 0.2)
    
    logger.info(f"Initializing RAG system: vectorstore={_vectorstore_type}, k={_k}, threshold={_score_threshold}")
    
    # Load PDFs from database
    from .pdf_loader import load_pdfs_from_database
    
    try:
        docs = load_pdfs_from_database()
        
        if not docs:
            logger.warning("No PDFs found in database")
            raise ValueError("Không tìm thấy PDF nào trong database")
            
        logger.info(f"Loaded {len(docs)} document chunks from database")
        
    except Exception as e:
        logger.error(f"Error loading PDFs from database: {str(e)}")
        raise
    
    # Get embeddings
    embeddings = get_embeddings()
    
    # Split documents
    chunk_size = getattr(settings, 'CHATBOT_CHUNK_SIZE', 1200)
    chunk_overlap = getattr(settings, 'CHATBOT_CHUNK_OVERLAP', 200)
    
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
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        add_start_index=True,
        strip_whitespace=True,
        separators=MARKDOWN_SEPARATORS,
    )
    
    splits = text_splitter.split_documents(docs)
    logger.info(f"Split into {len(splits)} chunks")
    
    # Vectorstore directory
    vectorstore_path = getattr(settings, 'CHATBOT_VECTORSTORE_PATH', settings.MEDIA_ROOT / "chatbot_vectorstore")
    vectorstore_path = Path(vectorstore_path)
    
    # Build or Load Vectorstore
    if _vectorstore_type == "faiss":
        faiss_dir = vectorstore_path / "faiss_index"
        
        if faiss_dir.exists() and any(faiss_dir.iterdir()):
            try:
                _vectorstore = FAISS.load_local(
                    folder_path=str(faiss_dir),
                    embeddings=embeddings,
                    allow_dangerous_deserialization=True
                )
                logger.info(f"✓ Loaded existing FAISS index from {faiss_dir}")
            except Exception as e:
                logger.warning(f"Failed to load existing FAISS index: {e}. Creating new one...")
                _vectorstore = _create_faiss_index(splits, embeddings, faiss_dir)
        else:
            _vectorstore = _create_faiss_index(splits, embeddings, faiss_dir)
            
    else:  # chroma
        chroma_dir = vectorstore_path / "chroma_db"
        
        if chroma_dir.exists() and any(chroma_dir.iterdir()):
            try:
                _vectorstore = Chroma(
                    collection_name="rag",
                    embedding_function=embeddings,
                    persist_directory=str(chroma_dir),
                )
                logger.info(f"✓ Loaded existing Chroma DB from {chroma_dir}")
            except Exception as e:
                logger.warning(f"Failed to load existing Chroma DB: {e}. Creating new one...")
                _vectorstore = _create_chroma_db(splits, embeddings, chroma_dir)
        else:
            _vectorstore = _create_chroma_db(splits, embeddings, chroma_dir)
    
    # Create retriever
    retriever = _vectorstore.as_retriever(
        search_type="similarity_score_threshold",
        search_kwargs={"k": _k, "score_threshold": _score_threshold}
    )
    
    # Prompt template
    template = (
        "Bạn là một trợ lý ảo cho hệ thống quản lý văn bản.\n\n"
        "{user_info}\n\n"
        "QUY TẮC:\n"
        "1) Sử dụng NGUYÊN VĂN NGỮ LIỆU để trả lời.\n"
        "2) Biết thông tin người dùng đang hỏi (xem trên).\n"
        "3) Nếu câu hỏi về bản thân người dùng, trả lời dựa trên thông tin đã cho.\n"
        "4) Nếu không tìm thấy trong ngữ liệu, nói rõ.\n\n"
        "Ngữ liệu:\n{context}\n\n"
        "Câu hỏi: {question}"
    )
    prompt = ChatPromptTemplate.from_template(template)
    
    # LLM
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        logger.error("GROQ_API_KEY not found in environment")
        raise ValueError("GROQ_API_KEY not configured. Please add to .env file")
    
    llm = ChatGroq(
        model="llama-3.1-8b-instant",
        groq_api_key=groq_api_key,
        temperature=0.1,
        max_tokens=512
    )
    
    # RAG Chain
    _rag_chain = (
        RunnableParallel({
            "context": RunnableLambda(lambda x: x["question"]) | retriever | format_docs,
            "question": RunnableLambda(lambda x: x["question"]),
            "user_info": RunnableLambda(lambda x: x.get("user_info", ""))
        })
        | prompt
        | llm
        | StrOutputParser()
    )
    
    logger.info("✓ RAG system initialized successfully")
    return True


def _create_faiss_index(splits, embeddings, faiss_dir):
    """Helper to create FAISS index"""
    from langchain_community.vectorstores import FAISS
    from langchain_community.vectorstores.utils import DistanceStrategy
    
    logger.info("Creating new FAISS index...")
    vectorstore = FAISS.from_documents(
        documents=splits,
        embedding=embeddings,
        distance_strategy=DistanceStrategy.COSINE
    )
    faiss_dir.mkdir(parents=True, exist_ok=True)
    vectorstore.save_local(str(faiss_dir))
    logger.info(f"✓ Created new FAISS index at {faiss_dir}")
    return vectorstore


def _create_chroma_db(splits, embeddings, chroma_dir):
    """Helper to create Chroma DB"""
    from langchain_community.vectorstores import Chroma
    
    logger.info("Creating new Chroma DB...")
    vectorstore = Chroma.from_documents(
        documents=splits,
        embedding=embeddings,
        collection_name="rag",
        persist_directory=str(chroma_dir),
        collection_metadata={"hnsw:space": "cosine"}
    )
    vectorstore.persist()
    logger.info(f"✓ Created new Chroma DB at {chroma_dir}")
    return vectorstore


def add_document_to_vectorstore(docs):
    """
    Thêm documents vào vectorstore hiện có
    
    Args:
        docs: List of LangChain Document objects
        
    Returns:
        bool: True nếu thành công
    """
    global _vectorstore, _vectorstore_type
    
    if _vectorstore is None:
        logger.error("Vectorstore not initialized")
        raise ValueError("Vectorstore chưa được khởi tạo. Gọi initialize_rag() trước.")
    
    try:
        # Import components
        from langchain_text_splitters import RecursiveCharacterTextSplitter
        
        # Split documents
        chunk_size = getattr(settings, 'CHATBOT_CHUNK_SIZE', 1200)
        chunk_overlap = getattr(settings, 'CHATBOT_CHUNK_OVERLAP', 200)
        
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            add_start_index=True,
            strip_whitespace=True,
        )
        
        splits = text_splitter.split_documents(docs)
        logger.info(f"Adding {len(splits)} chunks to vectorstore")
        
        # Add to vectorstore
        vectorstore_path = getattr(settings, 'CHATBOT_VECTORSTORE_PATH', settings.MEDIA_ROOT / "chatbot_vectorstore")
        vectorstore_path = Path(vectorstore_path)
        
        if _vectorstore_type == "faiss":
            _vectorstore.add_documents(splits)
            faiss_dir = vectorstore_path / "faiss_index"
            _vectorstore.save_local(str(faiss_dir))
            logger.info("✓ Documents added to FAISS index")
        else:
            _vectorstore.add_documents(splits)
            _vectorstore.persist()
            logger.info("✓ Documents added to Chroma DB")
        
        return True
        
    except Exception as e:
        logger.error(f"Error adding documents to vectorstore: {str(e)}")
        raise


def ask_rag(question, user_context=None, user=None):
    """
    Hỏi câu hỏi và nhận câu trả lời từ RAG system
    
    Args:
        question: Câu hỏi của người dùng
        
    Returns:
        str: Câu trả lời từ RAG system
    """
    global _rag_chain
    
    if _rag_chain is None:
        logger.error("RAG system not initialized")
        raise ValueError("RAG system chưa được khởi tạo. Gọi initialize_rag() trước.")
    
    try:
        logger.info(f"Processing question: {question[:100]}...")
        
        # Format user context
        from chatbot.utils import format_user_context_for_prompt
        user_info = format_user_context_for_prompt(user_context)
        
        # NEW: Add document summary if user is provided
        if user:
            try:
                from .document_query import get_user_documents_summary
                doc_summary = get_user_documents_summary(user)
                if doc_summary:
                    user_info += f"\n\n{doc_summary}"
            except Exception as e:
                logger.error(f"Error getting doc summary: {e}")
        
        response = _rag_chain.invoke({
            "question": question,
            "user_info": user_info
        })
        logger.info("✓ Response generated successfully")
        return response
    except Exception as e:
        error_msg = f"Lỗi khi xử lý câu hỏi: {str(e)}"
        logger.error(error_msg)
        return error_msg


def is_initialized():
    """Kiểm tra xem RAG system đã được khởi tạo chưa"""
    return _rag_chain is not None and _vectorstore is not None
