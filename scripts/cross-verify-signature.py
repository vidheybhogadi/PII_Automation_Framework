"""
Independent cross-check of the framework's signing against the integration guide's own Python example.

Uses the PUBLIC RFC 8032 test-vector key (NON-PRODUCTION, published in the RFC). Prints the Base64 signature
the guide's code produces for a fixed body. tests/unit/ed25519-signer.spec.ts asserts that the TypeScript
signer produces the identical value.

Run:  python3 -m venv .venv && .venv/bin/pip install cryptography && .venv/bin/python scripts/cross-verify-signature.py
"""
import base64
import hashlib
import json

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

RFC8032_TEST1_SEED = bytes.fromhex("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60")
pem = Ed25519PrivateKey.from_private_bytes(RFC8032_TEST1_SEED).private_bytes(
    serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
)

payload = {"tenant_id": "tenant-alpha", "user_id": "user-123", "field": "EMAIL", "value": "person@example.com"}
body = json.dumps(payload, separators=(",", ":")).encode("utf-8")

# --- exactly as in the guide ---
private_key = serialization.load_pem_private_key(pem, password=None)
signature = private_key.sign(hashlib.sha256(body).digest())
print("body:     ", body.decode())
print("signature:", base64.b64encode(signature).decode("ascii"))
