import os
import requests
import uuid

# 1. Pull the secure token from your GitHub Vault
access_token = os.environ.get("MERCADO_PAGO_ACCESS_TOKEN")

if not access_token:
    raise ValueError("Error: MERCADO_PAGO_ACCESS_TOKEN is missing from your environment vault.")

# 2. Set up the Mercado Pago Payment API endpoint
url = "https://api.mercadopago.com/v1/payments"

headers = {
    "Authorization": f"Bearer {access_token}",
    "Content-Type": "application/json",
    "X-Idempotency-Key": str(uuid.uuid4()) # Prevents duplicate transactions
}

# 3. Formulate the raw payment payload for a R$ 1.00 test Pix
payment_data = {
    "transaction_amount": 1.00,
    "description": "Amora Protocol - Casa Oliveira Infrastructure Unlock (Test)",
    "payment_method_id": "pix",
    "payer": {
        "email": "andeglenderson@gmail.com",
        "first_name": "Glenn",
        "last_name": "Anderson"
    }
}

print("Base credentials verified. Initializing secure handshake...")
print("📡 Connecting to Mercado Pago toll-booth rail...")

# 4. Fire the request
response = requests.post(url, json=payment_data, headers=headers)
data = response.json()

# 5. Extract the live machine-readable Pix strings
if response.status_code == 201:
    pix_copy_paste = data["point_of_interaction"]["transaction_data"]["qr_code"]
    print("\n✅ SUCCESS: Infrastructure Gate Primed!")
    print("\n--- PIX COPY AND PASTE STRING ---")
    print(pix_copy_paste)
    print("---------------------------------")
    print("\n💡 Copy the massive string above and paste it into your bank app to test!")
else:
    print(f"\n❌ Error triggering payment: {response.status_code}")
    print(data)
