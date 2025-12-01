import socket
import os

host = "127.0.0.1"
port = 55432

print(f"Checking connection to {host}:{port}...")
try:
    sock = socket.create_connection((host, port), timeout=5)
    print("Connection successful!")
    sock.close()
except Exception as e:
    print(f"Connection failed: {e}")
