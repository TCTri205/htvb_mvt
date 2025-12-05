from dotenv import load_dotenv  # Load .env file
load_dotenv()  # Gọi ngay để load GROQ_API_KEY
# from pprint import pprint
import os  # Để dùng os.getenv
import argparse
from pathlib import Path
from operator import itemgetter
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import DirectoryLoader, UnstructuredFileLoader
from langchain_community.vectorstores import Chroma, FAISS
from langchain_community.vectorstores.utils import DistanceStrategy
# from langchain_core.runnables import RunnableLambda
from langchain_groq import ChatGroq
from langchain_community.embeddings import HuggingFaceEmbeddings  # Embeddings local, không cần API key
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough, RunnableParallel

def get_args():
    parser = argparse.ArgumentParser("")
    parser.add_argument("--input_data", type=str, default="./data")
    parser.add_argument("--vectorstores", type=str, default="faiss", choices=["chroma", "faiss"])
    parser.add_argument("--persist_dir", type=str, default="./chroma_db")
    parser.add_argument("--faiss_dir", type=str, default="./faiss_index")
    parser.add_argument("--k", type=int, default=5)
    parser.add_argument("--score_threshold", type=float, default=0.2)
    return parser.parse_args()

def format_docs(docs):
    """Trích xuất page_content từ Documents và ghép lại"""
    return "\n\n".join(doc.page_content for doc in docs)

def rag_chatbot(args):
    # Load PDF documents
    loader = DirectoryLoader(
        path=args.input_data,
        glob="**/*.pdf",
        loader_cls=UnstructuredFileLoader,
        show_progress=True,
        use_multithreading=True,
    )
    docs = loader.load()

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

    # Split documents
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1200,
        chunk_overlap=200,
        add_start_index=True,
        strip_whitespace=True,
        separators=MARKDOWN_SEPARATORS,
    )
    splits = text_splitter.split_documents(docs)

    # EMBEDDING (Local - HuggingFace)
    # ================================
    # Sử dụng model embedding tiếng Việt tốt, chạy local không cần API key
    embeddings = HuggingFaceEmbeddings(
        model_name="keepitreal/vietnamese-sbert",  # Model embedding tiếng Việt
        model_kwargs={'device': 'cpu'},  # Sử dụng CPU (đổi 'cuda' nếu có GPU)
        encode_kwargs={'normalize_embeddings': True}  # Normalize để tính cosine similarity tốt hơn
    )

    # ================================
    # BUILD hoặc LOAD VECTORSTORE
    # ================================
    if args.vectorstores == "faiss":
        idx_dir = Path(args.faiss_dir)
        if idx_dir.exists():
            vectorstore = FAISS.load_local(
                folder_path=str(idx_dir),
                embeddings=embeddings,
                allow_dangerous_deserialization=True
            )
            print(f"Loaded FAISS index from {idx_dir.resolve()}")
        else:
            vectorstore = FAISS.from_documents(
                documents=splits,
                embedding=embeddings,
                distance_strategy=DistanceStrategy.COSINE
            )
            idx_dir.mkdir(parents=True, exist_ok=True)
            vectorstore.save_local(str(idx_dir))
            print(f"Saved new FAISS index to {idx_dir.resolve()}")
    else:
        persist_dir = Path(args.persist_dir)
        if persist_dir.exists():
            vectorstore = Chroma(
                collection_name="rag",
                embedding_function=embeddings,
                persist_directory=str(persist_dir),
            )
        else:
            vectorstore = Chroma.from_documents(
                documents=splits,
                embedding=embeddings,
                collection_name="rag",
                persist_directory=str(persist_dir),
                collection_metadata={"hnsw:space": "cosine"}
            )
            vectorstore.persist()

    retriever = vectorstore.as_retriever(
        search_type="similarity_score_threshold",
        search_kwargs={"k": args.k,
                       "score_threshold": args.score_threshold}
    )

    # Prompt template (sửa cho ChatPromptTemplate với messages format)
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

    # ================================
    # LLM SUY LUẬN (GROQ API - thay CTransformers)
    # ================================
    llm = ChatGroq(
        model="llama-3.1-8b-instant",  # Model chat nhanh của Groq (đổi sang 70b nếu cần mạnh hơn)
        groq_api_key=os.getenv("GROQ_API_KEY"),  # Lấy từ env var
        temperature=0.1,  # Thấp để deterministic hơn
        max_tokens=512  # Giới hạn output để tiết kiệm quota
    )

    # RAG Chain
    rag_chain = (
        RunnableParallel(
            {"context": retriever | format_docs, "question": RunnablePassthrough()}
        )
        | prompt
        | llm
        | StrOutputParser()
    )

    # Chat loop
    while True:
        user_input = input("Question: ").strip()
        if user_input.lower() == "exit":
            print("Exiting…")
            break
        print(rag_chain.invoke(user_input))

if __name__ == '__main__':
    args = get_args()
    rag_chatbot(args)