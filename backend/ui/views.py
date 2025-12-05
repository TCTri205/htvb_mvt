from django.shortcuts import render

# Create your views here.

def chatbot_ui(request):
    """Chatbot UI page - requires authentication to use API"""
    return render(request, 'chatbot/chat.html', {
        'page_title': 'Chatbot RAG'
    })
