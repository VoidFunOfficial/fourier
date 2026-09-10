"""Run with `python main.py` or `uvicorn main:app`."""

from server.app import create_app

app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
