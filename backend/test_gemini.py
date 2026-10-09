import httpx

key = 'AQ.Ab8RN6IUwDFsfHYmbkNIziRVY06e5RiRRbIpEuNWGV_QPhdTyg'
models = ['gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash-preview', 'gemini-flash-latest']

for m in models:
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={key}'
    body = {
        'contents': [{'parts': [{'text': 'Hello, respond with JSON: {"message": "ok"}'}]}],
        'generationConfig': {'responseMimeType': 'application/json'}
    }
    try:
        res = httpx.post(url, json=body, timeout=10)
        print(f'{m}: Status {res.status_code} - {res.text[:100]}')
    except Exception as e:
        print(f'{m}: Exception {e}')
