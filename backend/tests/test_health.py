def test_health_responds(client):
    """Health endpoint reports the database"""
    body = client.get("/api/health").json()
    assert body["status"] == "ok" and body["database"] == "up"
